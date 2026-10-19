import { hasValidOAuthPassword } from "./shared/oauth-helpers.js";
import { fetchUpstream } from "./shared/upstream-http.js";
import { githubProvider } from "../mcps/github/index.js";
import { cloudflareProvider } from "../mcps/cloudflare/index.js";

const PREFIX = "assistente:upstream:v2:";
const PROVIDERS = Object.freeze({
  github: githubProvider,
  cloudflare: cloudflareProvider,
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const refreshFlights = new WeakMap();
const discoveryFlights = new WeakMap();
const DISCOVERY_FRESH_MS = 60 * 60 * 1000;
const DISCOVERY_STALE_MS = 24 * 60 * 60 * 1000;

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
function retrySeconds(response) {
  const value = response.headers.get("retry-after");
  const seconds =
    value && /^\d+$/.test(value)
      ? Number(value)
      : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, 86400)
    : 60;
}
function httpFailure(response, endpointKind) {
  const error = Error("OAUTH_HTTP_" + response.status);
  error.httpStatus = response.status;
  error.endpointKind = endpointKind;
  if (response.status === 429) error.retryAfter = retrySeconds(response);
  return error;
}
async function fetchJson(
  fetchFn,
  url,
  init = {},
  endpointKind = "provider_api",
) {
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent"))
    headers.set("user-agent", "assistente-mcps/1.2");
  let response;
  try {
    response = await fetchUpstream(fetchFn, url, { ...init, headers });
  } catch (error) {
    error.endpointKind = endpointKind;
    throw error;
  }
  if (!response.ok) throw httpFailure(response, endpointKind);
  return response.json();
}
async function discover(provider, fetchFn) {
  const config = PROVIDERS[provider];
  const probe = await fetchUpstream(fetchFn, config.endpoint, {
    method: "POST",
    redirect: "manual",
    headers: {
      "user-agent": "assistente-mcps/1.2",
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "assistente-mcps", version: "1.0.0" },
      },
    }),
  });
  if (probe.status === 429 || probe.status >= 500)
    throw httpFailure(probe, "resource_challenge");
  const challenge = probe.headers.get("www-authenticate") ?? "";
  const marker = challenge.toLowerCase().indexOf("resource_metadata=");
  let metadataCandidate = null;
  if (marker >= 0) {
    const value = challenge
      .slice(marker + "resource_metadata=".length)
      .trimStart();
    if (value.startsWith('"')) {
      const closingQuote = value.indexOf('"', 1);
      if (closingQuote > 1) metadataCandidate = value.slice(1, closingQuote);
    } else {
      metadataCandidate = value.split(",")[0].trim().split(" ")[0];
    }
  }
  const metadataUrl = providerUrl(
    provider,
    metadataCandidate ?? resourceMetadataUrl(config.endpoint),
    "resource",
  );
  if (probe.status !== 401 && probe.status !== 403 && !metadataCandidate)
    throw Error("OAUTH_CHALLENGE_MISSING");
  const resource = await fetchJson(
    fetchFn,
    metadataUrl,
    { headers: { accept: "application/json" } },
    "resource_metadata",
  );
  if (
    !Array.isArray(resource.authorization_servers) ||
    resource.authorization_servers.length === 0
  )
    throw Error("AUTHORIZATION_SERVER_MISSING");
  const issuer = providerUrl(
    provider,
    resource.authorization_servers[0],
    "auth",
  );
  if (new URL(issuer).search) throw Error("OAUTH_ISSUER_INVALID");
  const metadata = await fetchJson(
    fetchFn,
    authorizationMetadataUrl(issuer),
    { headers: { accept: "application/json" } },
    "authorization_metadata",
  );
  if (
    typeof metadata.issuer !== "string" ||
    providerUrl(provider, metadata.issuer, "auth") !== issuer
  )
    throw Error("OAUTH_ISSUER_MISMATCH");
  return validateDiscovery(provider, {
    ...metadata,
    resource: resource.resource ?? config.endpoint,
    scopes: Array.isArray(resource.scopes_supported)
      ? resource.scopes_supported
      : (metadata.scopes_supported ?? []),
  });
}
function validateDiscovery(provider, candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    throw Error("OAUTH_METADATA_INCOMPLETE");
  const metadata = structuredClone(candidate);
  const config = PROVIDERS[provider];
  for (const name of ["authorization_endpoint", "token_endpoint", "issuer"]) {
    if (typeof metadata[name] !== "string")
      throw Error("OAUTH_METADATA_INCOMPLETE");
    providerUrl(provider, metadata[name], "auth");
  }
  if (new URL(metadata.issuer).search) throw Error("OAUTH_ISSUER_INVALID");
  for (const name of ["registration_endpoint", "revocation_endpoint"]) {
    if (metadata[name]) providerUrl(provider, metadata[name], "auth");
  }
  // MCP requires explicit S256 support in authorization-server metadata.
  // Missing or malformed PKCE metadata must fail closed, including cached data.
  if (
    !Array.isArray(metadata.code_challenge_methods_supported) ||
    !metadata.code_challenge_methods_supported.includes("S256")
  )
    throw Error("OAUTH_PKCE_UNSUPPORTED");
  if (providerUrl(provider, metadata.resource, "resource") !== config.endpoint)
    throw Error("OAUTH_RESOURCE_MISMATCH");
  return metadata;
}
export function upstreamDiscoveryCacheKey(provider) {
  if (!Object.hasOwn(PROVIDERS, provider)) throw Error("UNKNOWN_PROVIDER");
  return "assistente:discovery:v1:" + provider;
}
async function cachedDiscovery(env, provider, fetchFn) {
  const key = upstreamDiscoveryCacheKey(provider);
  const kv = storage(env);
  let cached;
  let cooldown;
  try {
    const raw = await kv.get(key);
    const value = raw ? JSON.parse(raw) : null;
    const age = Date.now() - value?.fetchedAt;
    if (
      value?.endpoint === PROVIDERS[provider].endpoint &&
      value?.error?.status === 429 &&
      value.retryAt > Date.now()
    )
      cooldown = value;
    if (
      value?.endpoint === PROVIDERS[provider].endpoint &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < DISCOVERY_STALE_MS
    ) {
      cached = {
        ...value,
        metadata: validateDiscovery(provider, value.metadata),
        age,
      };
    }
  } catch {
    // Invalid or unavailable caches cannot bypass live discovery validation.
  }
  if (
    cached &&
    (cached.age < DISCOVERY_FRESH_MS || cached.retryAt > Date.now())
  )
    return cached.metadata;
  if (cooldown)
    throw httpFailure(
      new Response(null, {
        status: 429,
        headers: {
          "retry-after": String(
            Math.ceil((cooldown.retryAt - Date.now()) / 1000),
          ),
        },
      }),
      cooldown.error.endpointKind,
    );
  try {
    const metadata = await discover(provider, fetchFn);
    const record = {
      endpoint: PROVIDERS[provider].endpoint,
      fetchedAt: Date.now(),
      metadata,
    };
    try {
      await kv.put(key, JSON.stringify(record), {
        expirationTtl: DISCOVERY_STALE_MS / 1000,
      });
    } catch {}
    return metadata;
  } catch (error) {
    const transient =
      error.httpStatus === 429 ||
      error.httpStatus >= 500 ||
      error.message === "UPSTREAM_REQUEST_TIMEOUT";
    if (!cached || !transient) {
      if (!cached && error.httpStatus === 429) {
        const record = {
          endpoint: PROVIDERS[provider].endpoint,
          retryAt: Date.now() + error.retryAfter * 1000,
          error: { status: 429, endpointKind: error.endpointKind },
        };
        try {
          await kv.put(key, JSON.stringify(record), {
            expirationTtl: Math.max(60, error.retryAfter),
          });
        } catch {}
      }
      throw error;
    }
    console.warn("assistente_oauth_discovery_cached", {
      provider,
      code: safeOAuthErrorCode(error),
      endpointKind: error.endpointKind ?? "discovery",
    });
    if (error.httpStatus === 429) {
      const record = {
        endpoint: cached.endpoint,
        fetchedAt: cached.fetchedAt,
        metadata: cached.metadata,
        retryAt: Date.now() + error.retryAfter * 1000,
      };
      const ttl = Math.max(
        60,
        Math.ceil((DISCOVERY_STALE_MS - cached.age) / 1000),
      );
      try {
        await kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
      } catch {}
    }
    return cached.metadata;
  }
}
export async function getUpstreamMetadata(env, provider, fetchFn = fetch) {
  upstreamDiscoveryCacheKey(provider);
  const kv = storage(env);
  if (!discoveryFlights.has(kv)) discoveryFlights.set(kv, new Map());
  const flights = discoveryFlights.get(kv);
  if (!flights.has(provider))
    flights.set(
      provider,
      cachedDiscovery(env, provider, fetchFn).finally(() =>
        flights.delete(provider),
      ),
    );
  return flights.get(provider);
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
  const metadata = await getUpstreamMetadata(env, provider, fetchFn);
  const adapter = PROVIDERS[provider];
  return adapter.clientOptions({
    env,
    metadata,
    fetchJson: (url, init) => fetchJson(fetchFn, url, init),
    fetchFn,
    readSealed,
    writeSealed,
    callbackUrl: callbackUrl(env, provider),
  });
}
function form(provider, operation, message = "") {
  const label = PROVIDERS[provider].label;
  const button = operation === "start" ? "Autorizar" : "Desconectar";
  return "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\">" +
    "<title>" + button + " " + label + "</title><style>" +
    "body{font:16px/1.5 system-ui,sans-serif;background:#f5f6f8;color:#17202a;margin:0;padding:24px;box-sizing:border-box}" +
    "main{max-width:520px;margin:8vh auto;padding:28px;background:white;border:1px solid #dce1e6;border-radius:12px}" +
    "h1{font-size:1.7rem;margin:0 0 16px}form{display:grid;gap:16px}label{display:grid;gap:8px}" +
    "input,button{font:inherit;padding:12px;border:1px solid #aab4be;border-radius:6px;box-sizing:border-box;width:100%}" +
    "button{background:#1649a0;color:white;cursor:pointer;font-weight:600}.error{color:#a32020}" +
    "</style><main><h1>" + button + " " + label + "</h1>" +
    "<p>Esta autorização é independente do OAuth do ChatGPT e usa a conta atualmente conectada ao provedor.</p>" +
    (message ? '<p class="error" role="alert">' + message + '</p>' : "") +
    "<form method=\"post\" action=\"/connections/" + provider + "/" + operation + "\">" +
    "<label>Senha do Assistente <input type=\"password\" name=\"password\" required autocomplete=\"current-password\"></label>" +
    "<button type=\"submit\">" + button + "</button></form></main></html>";
}
function html(body, status = 200, formProvider) {
  // Chromium checks the full POST redirect chain against the submitting page's CSP.
  // Generate sources only from our static provider allowlist, never request input.
  const config = PROVIDERS[formProvider];
  const formSources = ["'self'"];
  for (const host of config?.authHosts ?? []) {
    formSources.push("https://" + host);
    if (config.allowSubdomains) formSources.push("https://*." + host);
  }
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action " + formSources.join(" ") + "; base-uri 'none'; frame-ancestors 'none'"
    }
  });
}
function genericFailure(error, provider) {
  const rateLimited = error?.httpStatus === 429;
  const code = safeOAuthErrorCode(error);
  const response = html(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>' +
      (rateLimited
        ? "O provedor limitou temporariamente as consultas"
        : "Não foi possível concluir o OAuth") +
      "</h1><p>" +
      (rateLimited
        ? "Aguarde " +
          error.retryAfter +
          " segundos antes de tentar novamente. Sua senha não foi enviada ao provedor."
        : "Confira a configuração e o callback do provedor.") +
      "</p><p>Código de diagnóstico: <code>" +
      code +
      '</code>.</p><p><a href="/connections/' +
      provider +
      '/start">Iniciar nova autorização</a></p>',
    rateLimited ? 429 : 503,
  );
  if (rateLimited)
    response.headers.set("retry-after", String(error.retryAfter));
  return response;
}

function safeOAuthErrorCode(error) {
  const code = error instanceof Error ? error.message : "";
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code
    : "UNCLASSIFIED";
}

function logOAuthFailure(provider, stage, error) {
  const safeNames = new Set([
    "Error",
    "TypeError",
    "SyntaxError",
    "OperationError",
    "DataError",
  ]);
  console.error("assistente_oauth_failure", {
    provider,
    stage,
    code: safeOAuthErrorCode(error),
    endpointKind: [
      "resource_challenge",
      "resource_metadata",
      "authorization_metadata",
      "provider_api",
    ].includes(error?.endpointKind)
      ? error.endpointKind
      : "local",
    errorType: safeNames.has(error?.name) ? error.name : "Error",
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
    resource: config.resource,
    issuer: config.issuer,
    require_iss: config.authorization_response_iss_parameter_supported === true,
    expires_at: Date.now() + 600000
  }, 600);
  console.info("assistente_oauth_started", { provider, stage: "start", status: 303 });
  return new Response(null, { status: 303, headers: { location: url.href, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
function clientAuth(saved, body, headers) {
  body.set("client_id", saved.client_id);
  if (!saved.client_secret) return;
  if (saved.token_endpoint_auth_method === "client_secret_basic") {
    const encode = value => new URLSearchParams({ value }).toString().slice("value=".length);
    const bytes = encoder.encode(encode(saved.client_id) + ":" + encode(saved.client_secret));
    headers.set("authorization", "Basic " + btoa(String.fromCharCode(...bytes)));
  } else if (saved.token_endpoint_auth_method !== "none") {
    body.set("client_secret", saved.client_secret);
  }
}
function validateToken(token) {
  const errors = new Set(["invalid_request", "invalid_client", "invalid_grant", "unauthorized_client", "unsupported_grant_type", "invalid_scope", "bad_verification_code", "incorrect_client_credentials", "redirect_uri_mismatch"]);
  if (errors.has(token?.error)) throw Error("OAUTH_" + token.error.toUpperCase());
  if (typeof token?.access_token !== "string" || !token.access_token ||
      (token.token_type !== undefined && (typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer"))) throw Error("OAUTH_TOKEN_INVALID");
  return token;
}
async function exchange(env, provider, params, fetchFn) {
  const state = params.get("state");
  const code = params.get("code");
  if (params.getAll("state").length !== 1 || params.getAll("code").length > 1 || params.getAll("iss").length > 1 || params.getAll("error").length > 1 ||
      typeof state !== "string" || !state || state.length > 128) {
    return html("<h1>Estado OAuth inválido.</h1>", 400);
  }
  const saved = await readSealed(env, "state:" + state);
  if (!saved || saved.provider !== provider || !saved.issuer || saved.expires_at <= Date.now()) return html("<h1>Autorização expirada. Inicie uma nova conexão.</h1>", 400);
  const issuer = params.get("iss");
  if ((saved.require_iss && !issuer) || (issuer && issuer !== saved.issuer)) throw Error("OAUTH_CALLBACK_ISSUER_MISMATCH");
  await storage(env).delete(PREFIX + "state:" + state);
  if (params.has("error")) return html("<h1>Autorização recusada no provedor.</h1>", 400);
  if (typeof code !== "string" || !code || code.length > 2048) return html("<h1>Código OAuth inválido. Inicie uma nova conexão.</h1>", 400);
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
  const token = validateToken(await fetchJson(fetchFn, saved.token_endpoint, {
    method: "POST",
    headers,
    body: body.toString()
  }));
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
  console.info("assistente_oauth_connected", { provider, stage: "callback", status: 200 });
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
    const token = validateToken(await fetchJson(fetchFn, current.token_endpoint, {
      method: "POST",
      headers,
      body: body.toString()
    }));
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
  const kv = storage(env);
  if (!refreshFlights.has(kv)) refreshFlights.set(kv, new Map());
  const flights = refreshFlights.get(kv);
  if (!flights.has(provider)) {
    const pending = refreshToken(env, current, fetchFn).finally(() => flights.delete(provider));
    flights.set(provider, pending);
  }
  return flights.get(provider);
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
    return adapter ? await adapter.revoke({ env, token, fetchFn: (url, init) => fetchUpstream(fetchFn, url, init), clientAuth }) : false;
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
  if (
    parts.length !== 4 ||
    parts[1] !== "connections" ||
    !Object.hasOwn(PROVIDERS, parts[2]) ||
    !["start", "callback", "disconnect"].includes(parts[3])
  )
    return undefined;
  const provider = parts[2];
  const operation = parts[3];
  if (operation === "callback") {
    if (request.method !== "GET")
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET" },
      });
    try {
      return await exchange(env, provider, url.searchParams, fetchFn);
    } catch (error) {
      logOAuthFailure(provider, "callback", error);
      return genericFailure(error, provider);
    }
  }
  if (request.method === "GET") {
    try {
      // Check only public discovery documents, never client registration or tokens.
      if (operation === "start")
        await getUpstreamMetadata(env, provider, fetchFn);
      return html(form(provider, operation), 200, provider);
    } catch (error) {
      logOAuthFailure(provider, "discovery", error);
      return genericFailure(error, provider);
    }
  }
  if (request.method !== "POST")
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  if (!formOriginMatches(request, env))
    return html("<h1>Origem inválida.</h1>", 403);
  try {
    const data = await request.formData();
    if (
      !hasValidOAuthPassword(
        env.ASSISTENTE_OAUTH_PASSWORD,
        data.get("password"),
      )
    ) {
      return html(
        form(
          provider,
          operation,
          "Senha incorreta ou OAuth não configurado. Confira e tente novamente.",
        ),
        401,
        provider,
      );
    }
    if (operation === "disconnect") {
      const saved = await readSealed(env, "token:" + provider);
      const revoked = saved
        ? await revoke(provider, env, saved, fetchFn)
        : true;
      await storage(env).delete(PREFIX + "token:" + provider);
      return html(
        "<h1>Conexão local removida.</h1><p>" +
          (revoked
            ? "O provedor confirmou a revogação."
            : "A revogação remota não foi confirmada; revogue o acesso nas configurações da conta do provedor.") +
          "</p>",
      );
    }
    return await start(provider, env, fetchFn);
  } catch (error) {
    logOAuthFailure(provider, operation, error);
    return genericFailure(error, provider);
  }
}
