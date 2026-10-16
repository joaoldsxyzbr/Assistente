import assert from "node:assert/strict";
import test from "node:test";
import { getUpstreamAccessToken, handleUpstreamRoutes, hasUpstreamConnection } from "../server/upstream-oauth.js";

import { environment, post, githubFetch, cloudflareFetch } from "./helpers/upstream-fixtures.js";

test("GitHub OAuth discovers endpoints, uses PKCE, encrypts, refreshes, and revokes", async () => {
  const env = environment();
  const fetchFn = githubFetch();
  const start = await handleUpstreamRoutes(post("https://assistente.example/connections/github/start", { password: env.ASSISTENTE_OAUTH_PASSWORD }), env, fetchFn);
  assert.equal(start.status, 303);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.origin, "https://github.com");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("state"));
  const callback = await handleUpstreamRoutes(new Request(
    "https://assistente.example/connections/github/callback?state=" +
    encodeURIComponent(authorization.searchParams.get("state")) + "&code=temporary-code&iss=" + encodeURIComponent("https://github.com/login/oauth")
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
  assert.equal(start.status, 303);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.searchParams.get("client_id"), "cf-client");
  assert.equal(authorization.searchParams.get("resource"), "https://mcp.cloudflare.com/mcp");
  const callback = await handleUpstreamRoutes(new Request(
    "https://assistente.example/connections/cloudflare/callback?state=" +
    encodeURIComponent(authorization.searchParams.get("state")) + "&code=temporary-code&iss=" + encodeURIComponent("https://mcp.cloudflare.com")
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
  assert.equal(response.status, 303);
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
