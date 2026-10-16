import { hasValidOAuthPassword } from "./shared/oauth-helpers.js";
import { githubProvider } from "../mcps/github/index.js";
import { cloudflareProvider } from "../mcps/cloudflare/index.js";

const PREFIX = "assistente:upstream:v2:";
const PROVIDERS = Object.freeze({
  github: githubProvider,
  cloudflare: cloudflareProvider
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function unbase64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error("INVALID_KEY");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}
function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
function providerUrl(provider, value, kind = "auth") {
  const url = new URL(value);
  const config = PROVIDERS[provider];
  const hosts = kind === "resource" ? config?.resourceHosts : config?.authHosts;
  const allowed = config?.allowSubdomains
    ? [...(hosts ?? [])].some(host => url.hostname === host || url.hostname.endsWith("." + host))
    : hosts?.has(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !allowed) throw Error("UNTRUSTED_OAUTH_ENDPOINT");
  return url.href;
}
function resourceMetadataUrl(endpoint) {
  const url = new URL(endpoint);
  const suffix = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  return url.origin + "/.well-known/oauth-protected-resource" + suffix;
}
function authorizationMetadataUrl(issuer) {
  const url = new URL(issuer);
  const suffix = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
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
  const marker = challenge.toLowerCase().indexOf("resource_metadata=");
  let metadataCandidate = null;
  if (marker >= 0) {
    const value = challenge.slice(marker + "resource_metadata=".length).trimStart();
    if (value.startsWith('"')) {
      const closingQuote = value.indexOf('"', 1);
      if (closingQuote > 1) metadataCandidate = value.slice(1, closingQuote);
    } else {
      metadataCandidate = value.split(",")[0].trim().split(" ")[0];
    }
  }
  const metadataUrl = providerUrl(provider, metadataCandidate ?? resourceMetadataUrl(config.endpoint), "resource");
  if (probe.status !== 401 && probe.status !== 403 && !metadataCandidate) throw Error("OAUTH_CHALLENGE_MISSING");
  const resource = await fetchJson(fetchFn, metadataUrl, { headers: { accept: "application/json" } });
  if (!Array.isArray(resource.authorization_servers) || resource.authorization_servers.length === 0) throw Error("AUTHORIZATION_SERVER_MISSING");
  const issuer = providerUrl(provider, resource.authorization_servers[0], "auth");
  const metadata = await fetchJson(fetchFn, authorizationMetadataUrl(issuer), { headers: { accept: "application/json" } });
  for (const name of ["authorization_endpoint", "token_endpoint"]) {
    if (typeof metadata[name] !== "string") throw Error("OAUTH_METADATA_INCOMPLETE");
    metadata[name] = providerUrl(provider, metadata[name], "auth");
  }
  for (const name of ["registration_endpoint", "revocation_endpoint"]) {
    if (metadata[name]) metadata[name] = providerUrl(provider, metadata[name], "auth");
  }
  if (metadata.issuer && new URL(providerUrl(provider, metadata.issuer, "auth")).href !== issuer) throw Error("OAUTH_ISSUER_MISMATCH");
  return {
    ...metadata,
    resource: typeof resource.resource === "string" ? resource.resource : config.endpoint,
    scopes: Array.isArray(resource.scopes_supported) ? resource.scopes_supported : (metadata.scopes_supported ?? [])
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
async function clientOptions(env, provider, fetchFn) {
  const metadata = await discover(provider, fetchFn);
  const adapter = PROVIDERS[provider];
  return adapter.clientOptions({
    env,
    metadata,
    fetchJson: (url, init) => fetchJson(fetchFn, url, init),
    fetchFn,
    readSealed,
    writeSealed,
    callbackUrl: callbackUrl(env, provider)
  });
}
function form(provider, operation) {
  const label = PROVIDERS[provider].label;
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
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}
function genericFailure() {
  return html("<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><h1>Não foi possível concluir o OAuth</h1><p>Confira a configuração, autorizações e callback do provedor. Nenhum segredo foi exibido.</p>", 503);
}

function safeOAuthErrorCode(error) {
  const code = error instanceof Error ? error.message : "";
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code
    : "UNCLASSIFIED";
}

function logOAuthFailure(provider, stage, error) {
  const safeNames = new Set(["Error", "TypeError", "SyntaxError", "OperationError", "DataError"]);
  console.error("assistente_oauth_failure", {
    provider,
    stage,
    code: safeOAuthErrorCode(error),
    errorType: safeNames.has(error?.name) ? error.name : "Error"
  });
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
  const identityValid = await PROVIDERS[provider].verifyIdentity?.({
    env,
    accessToken: token.access_token,
    fetchJson: (url, init) => fetchJson(fetchFn, url, init),
    fetchFn
  });
  if (identityValid === false) {
    return html("<h1>" + PROVIDERS[provider].identityFailure + "</h1>", 403);
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
    PROVIDERS[provider].label +
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
    const adapter = PROVIDERS[provider];
    return adapter ? await adapter.revoke({ env, token, fetchFn, clientAuth }) : false;
  } catch {
    return false;
  }
}
function formOriginMatches(request, env) {
  const expected = publicOrigin(env);
  const origin = request.headers.get("origin");
  if (origin === expected) return true;
  if (origin !== null && origin !== "null") return false;
  const referer = request.headers.get("referer");
  if (referer === null) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}
export async function handleUpstreamRoutes(request, env, fetchFn = fetch) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  if (parts.length !== 4 || parts[1] !== "connections" ||
      !Object.hasOwn(PROVIDERS, parts[2]) ||
      !["start", "callback", "disconnect"].includes(parts[3])) return undefined;
  const provider = parts[2];
  const operation = parts[3];
  if (operation === "callback") {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
    if (url.searchParams.has("error")) return html("<h1>Autorização recusada no provedor.</h1>", 400);
    try {
      return await exchange(env, provider, url.searchParams.get("state"), url.searchParams.get("code"), fetchFn);
    } catch (error) {
      logOAuthFailure(provider, "callback", error);
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
  } catch (error) {
    logOAuthFailure(provider, operation, error);
    return genericFailure();
  }
}
