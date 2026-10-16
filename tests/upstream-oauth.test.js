import assert from "node:assert/strict";
import test from "node:test";
import { getUpstreamAccessToken, handleUpstreamRoutes, hasUpstreamConnection } from "../server/upstream-oauth.js";

class MemoryKV {
  values = new Map();
  async get(key) { return this.values.get(key) ?? null; }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
}
function environment(extra = {}) {
  return {
    OAUTH_KV: new MemoryKV(),
    ASSISTENTE_OAUTH_PASSWORD: "a".repeat(40),
    UPSTREAM_OAUTH_ENCRYPTION_KEY: "A".repeat(43),
    PUBLIC_ORIGIN: "https://assistente.example",
    GITHUB_OAUTH_CLIENT_ID: "github-client",
    GITHUB_OAUTH_CLIENT_SECRET: "github-secret",
    GITHUB_EXPECTED_LOGIN: "joaoldsxyzbr",
    ...extra
  };
}
function post(url, body, origin = "https://assistente.example") {
  return new Request(url, {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
}
function githubFetch() {
  let refreshes = 0;
  return async (url, init = {}) => {
    assert.equal(init.redirect, "manual", "OAuth requests must use a Workers-supported redirect mode");
    const target = String(url);
    if (target === "https://api.githubcopilot.com/mcp/x/all") {
      return new Response("", {
        status: 401,
        headers: { "www-authenticate": 'Bearer resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/x/all"' }
      });
    }
    if (target === "https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/x/all") {
      return Response.json({
        resource: "https://api.githubcopilot.com/mcp/x/all",
        authorization_servers: ["https://github.com/login/oauth"],
        scopes_supported: ["repo", "read:org"]
      });
    }
    if (target === "https://github.com/.well-known/oauth-authorization-server/login/oauth") {
      return Response.json({
        issuer: "https://github.com/login/oauth",
        authorization_endpoint: "https://github.com/login/oauth/authorize",
        token_endpoint: "https://github.com/login/oauth/access_token"
      });
    }
    if (target === "https://github.com/login/oauth/access_token") {
      const body = new URLSearchParams(init.body);
      if (body.get("grant_type") === "authorization_code") {
        assert.ok(body.get("code_verifier"));
        return Response.json({ access_token: "github-access", refresh_token: "github-refresh", expires_in: -1, token_type: "bearer" });
      }
      refreshes += 1;
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "github-refresh");
      return Response.json({ access_token: "github-refreshed", refresh_token: "github-refresh-2", expires_in: 3600 });
    }
    if (target === "https://api.github.com/user") {
      return Response.json({ login: "joaoldsxyzbr" });
    }
    if (target === "https://api.github.com/applications/github-client/token") {
      assert.equal(init.method, "DELETE");
      assert.match(init.headers.get("authorization"), /^Basic /);
      return new Response(null, { status: 204 });
    }
    throw Error("Unexpected URL " + target);
  };
}
function cloudflareFetch() {
  return async (url, init = {}) => {
    assert.equal(init.redirect, "manual", "OAuth requests must use a Workers-supported redirect mode");
    const target = String(url);
    if (target === "https://mcp.cloudflare.com/mcp") {
      return new Response("", {
        status: 401,
        headers: { "www-authenticate": 'Bearer resource_metadata="https://mcp.cloudflare.com/.well-known/oauth-protected-resource/mcp"' }
      });
    }
    if (target === "https://mcp.cloudflare.com/.well-known/oauth-protected-resource/mcp") {
      return Response.json({ resource: "https://mcp.cloudflare.com/mcp", authorization_servers: ["https://dash.cloudflare.com"] });
    }
    if (target === "https://dash.cloudflare.com/.well-known/oauth-authorization-server") {
      return Response.json({
        issuer: "https://dash.cloudflare.com",
        authorization_endpoint: "https://dash.cloudflare.com/oauth/authorize",
        token_endpoint: "https://dash.cloudflare.com/oauth/token",
        registration_endpoint: "https://dash.cloudflare.com/oauth/register",
        revocation_endpoint: "https://dash.cloudflare.com/oauth/revoke"
      });
    }
    if (target === "https://dash.cloudflare.com/oauth/register") {
      assert.equal(init.method, "POST");
      return Response.json({ client_id: "cf-client", token_endpoint_auth_method: "none" });
    }
    if (target === "https://dash.cloudflare.com/oauth/token") {
      return Response.json({ access_token: "cf-access", refresh_token: "cf-refresh", expires_in: 3600, token_type: "bearer" });
    }
    throw Error("Unexpected URL " + target);
  };
}
test("GitHub OAuth discovers endpoints, uses PKCE, encrypts, refreshes, and revokes", async () => {
  const env = environment();
  const fetchFn = githubFetch();
  const start = await handleUpstreamRoutes(post("https://assistente.example/connections/github/start", { password: env.ASSISTENTE_OAUTH_PASSWORD }), env, fetchFn);
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.origin, "https://github.com");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("state"));
  const callback = await handleUpstreamRoutes(new Request(
    "https://assistente.example/connections/github/callback?state=" +
    encodeURIComponent(authorization.searchParams.get("state")) + "&code=temporary-code"
  ), env, fetchFn);
  assert.equal(callback.status, 200);
  const stored = [...env.OAUTH_KV.values.values()].join(" ");
  assert.equal(stored.includes("github-access"), false);
  assert.equal(await getUpstreamAccessToken(env, "github", fetchFn), "github-refreshed");
  assert.equal(await hasUpstreamConnection(env, "github"), true);
  const disconnected = await handleUpstreamRoutes(post(
    "https://assistente.example/connections/github/disconnect",
    { password: env.ASSISTENTE_OAUTH_PASSWORD }
  ), env, fetchFn);
  assert.equal(disconnected.status, 200);
  assert.equal(await hasUpstreamConnection(env, "github"), false);
});
test("Cloudflare OAuth uses protected-resource discovery and DCR", async () => {
  const env = environment();
  const fetchFn = cloudflareFetch();
  const start = await handleUpstreamRoutes(post("https://assistente.example/connections/cloudflare/start", {
    password: env.ASSISTENTE_OAUTH_PASSWORD
  }), env, fetchFn);
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.searchParams.get("client_id"), "cf-client");
  assert.equal(authorization.searchParams.get("resource"), "https://mcp.cloudflare.com/mcp");
  const callback = await handleUpstreamRoutes(new Request(
    "https://assistente.example/connections/cloudflare/callback?state=" +
    encodeURIComponent(authorization.searchParams.get("state")) + "&code=temporary-code"
  ), env, fetchFn);
  assert.equal(callback.status, 200);
  assert.equal(await getUpstreamAccessToken(env, "cloudflare", fetchFn), "cf-access");
});
test("upstream management POSTs reject cross-origin requests", async () => {
  const env = environment();
  const response = await handleUpstreamRoutes(
    post("https://assistente.example/connections/github/start", { password: env.ASSISTENTE_OAUTH_PASSWORD }, "https://attacker.example"),
    env,
    githubFetch()
  );
  assert.equal(response.status, 403);
});

test("OAuth discovery rejects redirects without visiting their destinations", async () => {
  const endpoints = [
    "https://api.githubcopilot.com/mcp/x/all",
    "https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/x/all",
    "https://github.com/.well-known/oauth-authorization-server/login/oauth"
  ];
  for (const endpoint of endpoints) {
    const env = environment();
    const normalFetch = githubFetch();
    const fetchFn = async (url, init) => {
      assert.notEqual(new URL(url).hostname, "attacker.example");
      assert.equal(init.redirect, "manual");
      if (String(url) === endpoint) {
        return new Response(null, { status: 302, headers: {
          location: "https://attacker.example/collect",
          "www-authenticate": 'Bearer resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/x/all"'
        } });
      }
      return normalFetch(url, init);
    };
    const response = await handleUpstreamRoutes(post(
      "https://assistente.example/connections/github/start",
      { password: env.ASSISTENTE_OAUTH_PASSWORD }
    ), env, fetchFn);
    assert.equal(response.status, 503);
    assert.equal(env.OAUTH_KV.values.size, 0);
  }
});

test("upstream management accepts same-origin Referer when Origin is absent", async () => {
  const env = environment();
  const formResponse = await handleUpstreamRoutes(
    new Request("https://assistente.example/connections/github/start"),
    env,
    githubFetch()
  );
  assert.equal(formResponse.status, 200);
  assert.equal(formResponse.headers.get("referrer-policy"), "same-origin");

  const request = new Request("https://assistente.example/connections/github/start", {
    method: "POST",
    headers: {
      referer: "https://assistente.example/connections/github/start",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ password: env.ASSISTENTE_OAUTH_PASSWORD })
  });
  const response = await handleUpstreamRoutes(request, env, githubFetch());
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("location")).origin, "https://github.com");
});

test("upstream management rejects missing Origin with cross-origin Referer", async () => {
  const env = environment();
  const request = new Request("https://assistente.example/connections/github/start", {
    method: "POST",
    headers: {
      referer: "https://attacker.example/forged",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ password: env.ASSISTENTE_OAUTH_PASSWORD })
  });
  const response = await handleUpstreamRoutes(request, env, githubFetch());
  assert.equal(response.status, 403);
});
