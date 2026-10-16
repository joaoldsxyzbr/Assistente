import assert from "node:assert/strict";
import test from "node:test";
import { fetchUpstream } from "../server/shared/upstream-http.js";
import {
  handleUpstreamRoutes,
  getUpstreamAccessToken,
} from "../server/upstream-oauth.js";
import {
  environment,
  post,
  githubFetch,
  cloudflareFetch,
} from "./helpers/upstream-fixtures.js";

async function begin(env, fetchFn = githubFetch(), provider = "github") {
  const response = await handleUpstreamRoutes(
    post(
      env.PUBLIC_ORIGIN + "/connections/" + provider + "/start",
      { password: env.ASSISTENTE_OAUTH_PASSWORD },
      env.PUBLIC_ORIGIN,
    ),
    env,
    fetchFn,
  );
  assert.equal(response.status, 303);
  const authorization = new URL(response.headers.get("location"));
  const callback = new URL(
    env.PUBLIC_ORIGIN + "/connections/" + provider + "/callback",
  );
  callback.searchParams.set("state", authorization.searchParams.get("state"));
  callback.searchParams.set(
    "iss",
    provider === "github"
      ? "https://github.com/login/oauth"
      : "https://mcp.cloudflare.com",
  );
  callback.searchParams.set("code", "temporary-code");
  return { callback, authorization };
}
test("HTTP requests reject redirects and respect abort timeout", async () => {
  await assert.rejects(
    fetchUpstream(
      async () => new Response(null, { status: 307 }),
      "https://example.com",
    ),
    /UPSTREAM_REDIRECT_REJECTED/,
  );
  const pending = fetchUpstream(
    (url, { signal, redirect }) =>
      new Promise((resolve, reject) => {
        assert.equal(redirect, "manual");
        signal.addEventListener("abort", () => reject(signal.reason));
      }),
    "https://example.com",
    {},
    10,
  );
  // Keep Node alive while AbortSignal.timeout's unref'ed timer fires.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(pending, /UPSTREAM_REQUEST_TIMEOUT/);
  } finally {
    clearTimeout(keepAlive);
  }
});
for (const problem of [
  "missing-issuer",
  "wrong-issuer",
  "duplicate-state",
  "duplicate-code",
]) {
  test(
    "OAuth callback rejects " + problem + " before exchanging any code",
    async () => {
      const env = environment();
      const normal = githubFetch();
      let tokenRequests = 0;
      const fetchFn = async (url, init) => {
        if (String(url).endsWith("access_token")) tokenRequests++;
        return normal(url, init);
      };
      const { callback } = await begin(env, fetchFn);
      if (problem === "missing-issuer") callback.searchParams.delete("iss");
      if (problem === "wrong-issuer")
        callback.searchParams.set("iss", "https://attacker.example");
      if (problem === "duplicate-state")
        callback.searchParams.append("state", "other");
      if (problem === "duplicate-code")
        callback.searchParams.append("code", "other");
      const response = await handleUpstreamRoutes(
        new Request(callback),
        env,
        fetchFn,
      );
      assert.ok(response.status >= 400);
      assert.equal(tokenRequests, 0);
    },
  );
}
test("OAuth callback consumes state and a replay cannot exchange another code", async () => {
  const env = environment();
  const fetchFn = githubFetch();
  const { callback } = await begin(env, fetchFn);
  assert.equal(
    (await handleUpstreamRoutes(new Request(callback), env, fetchFn)).status,
    200,
  );
  assert.equal(
    (await handleUpstreamRoutes(new Request(callback), env, fetchFn)).status,
    400,
  );
});
test("provider denial requires matching state and issuer, then consumes state", async () => {
  const env = environment();
  const fetchFn = githubFetch();
  const { callback } = await begin(env, fetchFn);
  callback.searchParams.delete("code");
  callback.searchParams.set("error", "access_denied");
  const response = await handleUpstreamRoutes(
    new Request(callback),
    env,
    fetchFn,
  );
  assert.equal(response.status, 400);
  assert.match(await response.text(), /recusada/);
  assert.equal(
    [...env.OAUTH_KV.values.keys()].filter((key) => key.includes("state:"))
      .length,
    0,
  );
});
test("expired state cannot exchange a code even before KV propagation/deletion", async () => {
  const env = environment();
  const fetchFn = githubFetch();
  const { callback } = await begin(env, fetchFn);
  const now = Date.now;
  Date.now = () => now() + 601000;
  try {
    assert.equal(
      (await handleUpstreamRoutes(new Request(callback), env, fetchFn)).status,
      400,
    );
  } finally {
    Date.now = now;
  }
});
test("concurrent token refresh is coalesced within the Worker isolate", async () => {
  const env = environment();
  const normal = githubFetch();
  let refreshes = 0;
  const fetchFn = async (url, init) => {
    if (
      String(url).endsWith("access_token") &&
      new URLSearchParams(init.body).get("grant_type") === "refresh_token"
    ) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return normal(url, init);
  };
  const { callback } = await begin(env, fetchFn);
  await handleUpstreamRoutes(new Request(callback), env, fetchFn);
  const tokens = await Promise.all(
    Array.from({ length: 8 }, () =>
      getUpstreamAccessToken(env, "github", fetchFn),
    ),
  );
  assert.deepEqual(tokens, Array(8).fill("github-refreshed"));
  assert.equal(refreshes, 1);
});
test("GitHub identity mismatch never stores the token", async () => {
  const env = environment();
  const normal = githubFetch();
  const fetchFn = (url, init) =>
    String(url) === "https://api.github.com/user"
      ? Response.json({ login: "other" })
      : normal(url, init);
  const { callback } = await begin(env, fetchFn);
  assert.equal(
    (await handleUpstreamRoutes(new Request(callback), env, fetchFn)).status,
    403,
  );
  assert.equal(await getUpstreamAccessToken(env, "github", fetchFn), null);
});
test("Cloudflare registration is reused only for the same callback and issuer", async () => {
  const env = environment();
  const normal = cloudflareFetch();
  let registrations = 0;
  const fetchFn = (url, init) => {
    if (String(url).endsWith("/register")) registrations++;
    return normal(url, init);
  };
  const first = await begin(env, fetchFn, "cloudflare");
  assert.match(first.authorization.searchParams.get("scope"), /offline_access/);
  await begin(env, fetchFn, "cloudflare");
  assert.equal(registrations, 1);
  env.PUBLIC_ORIGIN = "https://preview.example";
  await begin(env, fetchFn, "cloudflare");
  assert.equal(registrations, 2);
});
