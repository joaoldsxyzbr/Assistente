import { hasValidOAuthPassword } from "./shared/oauth-helpers.js";

const PREFIX = "assistente:upstream:v2:";
const PROVIDERS = Object.freeze({
  github: {
    endpoint: "https://api.githubcopilot.com/mcp/x/all",
    resourceHosts: new Set(["api.githubcopilot.com", "github.com"]),
    authHosts: new Set(["github.com", "api.github.com"]),
    defaultScopes: "repo read:org read:user user:email read:packages write:packages read:project project gist notifications workflow offline_access"
  },
  cloudflare: {
    endpoint: "https://mcp.cloudflare.com/mcp",
    resourceHosts: new Set(["mcp.cloudflare.com"]),
    authHosts: new Set(["cloudflare.com", "cloudflareaccess.com"])
  }
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}
function unbase64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error("INVALID_KEY");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
function providerUrl(provider, value) {
  const url = new URL(value);
  const hosts = PROVIDERS[provider]?.authHosts;
  const allowed = provider === "cloudflare"
    ? [...(hosts ?? [])].some(host => url.hostname === host || url.hostname.endsWith("." + host))
    : hosts?.has(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !allowed) throw Error("UNTRUSTED_OAUTH_ENDPOINT");
  return url.href;
}
function resourceMetadataUrl(endpoint) {
  const url = new URL(endpoint);
  const suffix = url.pathname.replace(/\\/$/, "");
  return url.origin + "/.well-known/oauth-protected-resource" + suffix;
}
function authorizationMetadataUrl(issuer) {
  const url = new URL(issuer);
  const suffix = url.pathname.replace(/\\/$/, "");
  return url.origin + "/.well-known/oauth-authorization-server" + suffix;
}
async function fetchJson(fetchFn, url, init = {}) {
  const response = await fetchFn(url, { ...init, redirect: "error" });
  if (!response.ok) throw Error("OAUTH_HTTP_" + response.status);
  return response.json();
}
async function discover(provider, fetchFn) {
  const config = PROVIDERS[provider];
  const probe = await fetchFn(config.endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "assistente-mcps", version: "1.0.0" }
      }
    })
  });
  const challenge = probe.headers.get("www-authenticate") ?? "";
  const match = /resource_metadata\\s*=\\s*(?:"([^"]+)"|([^,\\s]+))/i.exec(challenge);
  const metadataUrl = providerUrl(provider, match?.[1] ?? match?.[2] ?? resourceMetadataUrl(config.endpoint));
  if (probe.status !== 401 && probe.status !== 403 && !match) throw Error("OAUTH_CHALLENGE_MISSING");
  const resource = await fetchJson(fetchFn, metadataUrl, { headers: { accept: "application/json" } });
  if (!Array.isArray(resource.authorization_servers) || resource.authorization_servers.length === 0) throw Error("AUTHORIZATION_SERVER_MISSING");
  const issuer = providerUrl(provider, resource.authorization_servers[0]);
  const metadata = await fetchJson(fetchFn, authorizationMetadataUrl(issuer), { headers: { accept: "application/json" } });
  for (const name of ["authorization_endpoint", "token_endpoint"]) {
    if (typeof metadata[name] !== "string") throw Error("OAUTH_METADATA_INCOMPLETE");
    metadata[name] = providerUrl(provider, metadata[name]);
  }
  for (const name of ["registration_endpoint", "revocation_endpoint"]) {
    if (metadata[name]) metadata[name] = providerUrl(provider, metadata[name]);
  }
  if (metadata.issuer && new URL(providerUrl(provider, metadata.issuer)).href !== issuer) throw Error("OAUTH_ISSUER_MISMATCH");
  return {
    resource: typeof resource.resource === "string" ? resource.resource : config.endpoint,
    scopes: Array.isArray(resource.scopes_supported) ? resource.scopes_supported : (metadata.scopes_supported ?? []),
    ...metadata
  };
}
function publicOrigin(env) {
  const value = env.PUBLIC_ORIGIN || "https://assistente.joaolds.xyz.br";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error("PUBLIC_ORIGIN_INVALID");
  return url.origin;
}
function callbackUrl(env, provider) {
  return publicOrigin(env) + "/connections/" + provider + "/callback";
}
function storage(env) {
  if (!env.OAUTH_KV || typeof env.OAUTH_KV.get !== "function" || typeof env.OAUTH_KV.put !== "function" || typeof env.OAUTH_KV.delete !== "function") {
    throw Error("OAUTH_KV_UNCONFIGURED");
  }
  return env.OAUTH_KV;
}
async function encryptionKey(env) {
  const bytes = unbase64url(env.UPSTREAM_OAUTH_ENCRYPTION_KEY || "");
  if (bytes.byteLength !== 32) throw Error("ENCRYPTION_KEY_UNCONFIGURED");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoder.encode(JSON.stringify(value))
  );
  return base64url(iv) + "." + base64url(new Uint8Array(ciphertext));
}
async function unseal(env, value) {
  const parts = typeof value === "string" ? value.split(".") : [];
  if (parts.length !== 2) throw Error("INVALID_RECORD");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unbase64url(parts[0]) },
    await encryptionKey(env),
    unbase64url(parts[1])
  );
  return JSON.parse(decoder.decode(clear));
}
async function readSealed(env, key) {
  const value = await storage(env).get(PREFIX + key);
  return value ? unseal(env, value) : null;
}
async function writeSealed(env, key, value, ttl) {
  await storage(env).put(
    PREFIX + key,
    await seal(env, value),
    ttl ? { expirationTtl: ttl } : undefined
  );
}
function splitScopes(value) {
  return String(value ?? "").trim().split(/[ ,]+/).filter(Boolean).join(" ");
}
async function clientOptions(env, provider, fetchFn) {
  const metadata = await discover(provider, fetchFn);
  if (provider === "github") {
    const clientId = env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw Error("GITHUB_OAUTH_APP_UNCONFIGURED");
    return {
      ...metadata,
      client_id: clientId,
      client_secret: clientSecret,
      token_endpoint_auth_method: "client_secret_post",
      scope: splitScopes(env.GITHUB_OAUTH_SCOPES || PROVIDERS.github.defaultScopes)
    };
  }
  let client = await readSealed(env, "client:cloudflare");
  if (!metadata.registration_endpoint) throw Error("CLOUDFLARE_DCR_UNAVAILABLE");
  if (!client || client.registration_endpoint !== metadata.registration_endpoint ||
      (client.client_secret_expires_at && client.client_secret_expires_at * 1000 < Date.now())) {
    const registered = await fetchJson(fetchFn, metadata.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_name: "Assistente MCPs",
        redirect_uris: [callbackUrl(env, provider)],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      })
    });
    if (typeof registered.client_id !== "string" || !registered.client_id) throw Error("CLOUDFLARE_DCR_INVALID");
    client = {
      client_id: registered.client_id,
      client_secret: registered.client_secret ?? "",
      token_endpoint_auth_method: registered.token_endpoint_auth_method ?? "none",
      registration_endpoint: metadata.registration_endpoint,
      client_secret_expires_at: registered.client_secret_expires_at ?? 0
    };
    await writeSealed(env, "client:cloudflare", client);
  }
  return {
    ...metadata,
    ...client,
    scope: splitScopes(env.CLOUDFLARE_OAUTH_SCOPES)
  };
}
function form(provider, operation) {
  const label = provider === "github" ? "GitHub" : "Cloudflare";
  const button = operation === "start" ? "Autorizar" : "Desconectar";
  return "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\">" +
    "<title>" + button + " " + label + "</title><main><h1>" + button + " " + label + "</h1>" +
    "<p>Esta autorização é independente do OAuth do ChatGPT e usa a conta atualmente conectada ao provedor.</p>" +
    "<form method=\"post\" action=\"/connections/" + provider + "/" + operation + "\">" +
    "<label>Senha do Assistente <input type=\"password\" name=\"password\" required autocomplete=\"current-password\"></label>" +
    "<button type=\"submit\">" + button + "</button></form></main></html>";
}
function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}
function genericFailure() {
  return html("<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><h1>Não foi possível concluir o OAuth</h1><p>Confira a configuração, autorizações e callback do provedor. Nenhum segredo foi exibido.</p>", 503);
}
async function start(provider, env, fetchFn) {
  const config = await clientOptions(env, provider, fetchFn);
  const state = randomString();
  const verifier = randomString();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)));
  const url = new URL(config.authorization_endpoint);
  url.searchParams.set("client_id", config.client_id);
  url.searchParams.set("redirect_uri", callbackUrl(env, provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", base64url(digest));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", config.resource);
  if (config.scope) url.searchParams.set("scope", config.scope);
  await writeSealed(env, "state:" + state, {
    provider,
    verifier,
    client_id: config.client_id,
    client_secret: config.client_secret ?? "",
    token_endpoint_auth_method: config.token_endpoint_auth_method ?? "client_secret_post",
    token_endpoint: config.token_endpoint,
    revocation_endpoint: config.revocation_endpoint ?? null,
    resource: config.resource
  }, 600);
  return Response.redirect(url.href, 302);
}
function clientAuth(saved, body, headers) {
  body.set("client_id", saved.client_id);
  if (!saved.client_secret) return;
  if (saved.token_endpoint_auth_method === "client_secret_basic") {
    const bytes = encoder.encode(saved.client_id + ":" + saved.client_secret);
    headers.set("authorization", "Basic " + btoa(String.fromCharCode(...bytes)));
  } else if (saved.token_endpoint_auth_method !== "none") {
    body.set("client_secret", saved.client_secret);
  }
}
async function exchange(env, provider, state, code, fetchFn) {
  if (typeof state !== "string" || state.length > 128 || typeof code !== "string" || !code || code.length > 2048) {
    return html("<h1>Estado OAuth inválido.</h1>", 400);
  }
  const saved = await readSealed(env, "state:" + state);
  if (!saved || saved.provider !== provider) return html("<h1>Autorização expirada. Inicie uma nova conexão.</h1>", 400);
  await storage(env).delete(PREFIX + "state:" + state);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: saved.verifier,
    redirect_uri: callbackUrl(env, provider),
    resource: saved.resource
  });
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json"
  });
  clientAuth(saved, body, headers);
  const token = await fetchJson(fetchFn, saved.token_endpoint, {
    method: "POST",
    headers,
    body: body.toString()
  });
  if (typeof token.access_token !== "string" || !token.access_token ||
      (token.token_type && token.token_type.toLowerCase() !== "bearer")) throw Error("OAUTH_TOKEN_INVALID");
  if (provider === "github") {
    const identity = await fetchJson(fetchFn, "https://api.github.com/user", {
      headers: {
        authorization: "Bearer " + token.access_token,
        "user-agent": "assistente-mcps",
        accept: "application/vnd.github+json"
      }
    });
    const expected = env.GITHUB_EXPECTED_LOGIN;
    if (!identity.login || (expected && identity.login.toLowerCase() !== expected.toLowerCase())) {
      return html("<h1>A conta GitHub autorizada não corresponde à conta configurada.</h1>", 403);
    }
  }
  await writeSealed(env, "token:" + provider, {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_at: Number.isFinite(token.expires_in) ? Date.now() + token.expires_in * 1000 : null,
    refresh_token_expires_at: Number.isFinite(token.refresh_token_expires_in) ? Date.now() + token.refresh_token_expires_in * 1000 : null,
    client_id: saved.client_id,
    client_secret: saved.client_secret,
    token_endpoint_auth_method: saved.token_endpoint_auth_method,
    token_endpoint: saved.token_endpoint,
    revocation_endpoint: saved.revocation_endpoint,
    resource: saved.resource
  });
  return html("<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><h1>" +
    (provider === "github" ? "GitHub" : "Cloudflare") +
    " conectado.</h1><p>Volte ao ChatGPT e consulte o estado do Assistente MCPs.</p>");
}
async function refreshToken(env, current, fetchFn) {
  if (!current.expires_at || current.expires_at > Date.now() + 60000) return current.access_token;
  if (!current.refresh_token ||
      (current.refresh_token_expires_at && current.refresh_token_expires_at <= Date.now())) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
    resource: current.resource
  });
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json"
  });
  clientAuth(current, body, headers);
  try {
    const token = await fetchJson(fetchFn, current.token_endpoint, {
      method: "POST",
      headers,
      body: body.toString()
    });
    if (typeof token.access_token !== "string" || !token.access_token) return null;
    const updated = {
      ...current,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? current.refresh_token,
      expires_at: Number.isFinite(token.expires_in) ? Date.now() + token.expires_in * 1000 : null,
      refresh_token_expires_at: Number.isFinite(token.refresh_token_expires_in)
        ? Date.now() + token.refresh_token_expires_in * 1000
        : current.refresh_token_expires_at
    };
    await writeSealed(env, "token:" + (current.provider ?? ""), updated);
    return updated.access_token;
  } catch {
    return null;
  }
}
async function tokenFor(env, provider, fetchFn) {
  const current = await readSealed(env, "token:" + provider);
  if (!current) return null;
  current.provider = provider;
  return refreshToken(env, current, fetchFn);
}
export async function getUpstreamAccessToken(env, provider, fetchFn = fetch) {
  if (!Object.hasOwn(PROVIDERS, provider)) return null;
  try {
    return await tokenFor(env, provider, fetchFn);
  } catch {
    return null;
  }
}
export async function hasUpstreamConnection(env, provider) {
  return Boolean(await getUpstreamAccessToken(env, provider));
}
async function revoke(provider, env, token, fetchFn) {
  try {
    if (provider === "github") {
      const credentials = encoder.encode(token.client_id + ":" + token.client_secret);
      const response = await fetchFn(
        "https://api.github.com/applications/" + encodeURIComponent(token.client_id) + "/token",
        {
          method: "DELETE",
          redirect: "error",
          headers: {
            authorization: "Basic " + btoa(String.fromCharCode(...credentials)),
            "content-type": "application/json",
            "user-agent": "assistente-mcps",
            accept: "application/vnd.github+json"
          },
          body: JSON.stringify({ access_token: token.access_token })
        }
      );
      return response.ok || response.status === 404;
    }
    if (!token.revocation_endpoint) return false;
    let ok = true;
    for (const value of [token.refresh_token, token.access_token].filter(Boolean)) {
      const body = new URLSearchParams({ token: value });
      const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
      if (token.client_id) clientAuth(token, body, headers);
      const response = await fetchFn(token.revocation_endpoint, {
        method: "POST",
        redirect: "error",
        headers,
        body: body.toString()
      });
      ok = ok && (response.ok || response.status === 200);
    }
    return ok;
  } catch {
    return false;
  }
}
function formOriginMatches(request, env) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === publicOrigin(env);
}
export async function handleUpstreamRoutes(request, env, fetchFn = fetch) {
  const url = new URL(request.url);
  const match = /^\\/connections\\/(github|cloudflare)\\/(start|callback|disconnect)$/.exec(url.pathname);
  if (!match) return undefined;
  const [, provider, operation] = match;
  if (operation === "callback") {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
    if (url.searchParams.has("error")) return html("<h1>Autorização recusada no provedor.</h1>", 400);
    try {
      return await exchange(env, provider, url.searchParams.get("state"), url.searchParams.get("code"), fetchFn);
    } catch {
      return genericFailure();
    }
  }
  if (request.method === "GET") return html(form(provider, operation));
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
  if (!formOriginMatches(request, env)) return html("<h1>Origem inválida.</h1>", 403);
  try {
    const data = await request.formData();
    if (!hasValidOAuthPassword(env.ASSISTENTE_OAUTH_PASSWORD, data.get("password"))) {
      return html("<h1>Senha incorreta ou OAuth não configurado.</h1>", 401);
    }
    if (operation === "disconnect") {
      const saved = await readSealed(env, "token:" + provider);
      const revoked = saved ? await revoke(provider, env, saved, fetchFn) : true;
      await storage(env).delete(PREFIX + "token:" + provider);
      return html("<h1>Conexão local removida.</h1><p>" +
        (revoked
          ? "O provedor confirmou a revogação."
          : "A revogação remota não foi confirmada; revogue o acesso nas configurações da conta do provedor.") +
        "</p>");
    }
    return await start(provider, env, fetchFn);
  } catch {
    return genericFailure();
  }
}
