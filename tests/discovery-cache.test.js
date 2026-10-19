import assert from "node:assert/strict";
import test from "node:test";
import {
  getUpstreamMetadata,
  upstreamDiscoveryCacheKey,
  handleUpstreamRoutes,
} from "../server/upstream-oauth.js";
import { environment, githubFetch, cloudflareFetch } from "./helpers/upstream-fixtures.js";
const authMetadata =
  "https://github.com/.well-known/oauth-authorization-server/login/oauth";
const startUrl = "https://assistente.example/connections/github/start";
async function stale(env, ageMs) {
  const key = upstreamDiscoveryCacheKey("github");
  const record = JSON.parse(await env.OAUTH_KV.get(key));
  record.fetchedAt = Date.now() - ageMs;
  await env.OAUTH_KV.put(key, JSON.stringify(record));
}
test("fresh discovery cache avoids every external request on repeated GET and POST", async () => {
  const env = environment();
  await getUpstreamMetadata(env, "github", githubFetch());
  const noNetwork = () => {
    throw Error("NETWORK_MUST_NOT_BE_CALLED");
  };
  const form = await handleUpstreamRoutes(
    new Request(startUrl),
    env,
    noNetwork,
  );
  assert.equal(form.status, 200);
  const started = await handleUpstreamRoutes(
    new Request(startUrl, {
      method: "POST",
      headers: {
        origin: env.PUBLIC_ORIGIN,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ password: env.ASSISTENTE_OAUTH_PASSWORD }),
    }),
    env,
    noNetwork,
  );
  assert.equal(started.status, 303);
  assert.equal(
    new URL(started.headers.get("location")).origin,
    "https://github.com",
  );
});
test("stale validated metadata permits OAuth during 429 and honors Retry-After", async () => {
  const env = environment();
  const normal = githubFetch();
  await getUpstreamMetadata(env, "github", normal);
  await stale(env, 3601000);
  let requests = 0;
  const limited = (url, init) => {
    requests++;
    return String(url) === authMetadata
      ? new Response(null, { status: 429, headers: { "retry-after": "120" } })
      : normal(url, init);
  };
  const metadata = await getUpstreamMetadata(env, "github", limited);
  assert.equal(metadata.issuer, "https://github.com/login/oauth");
  assert.equal(requests, 3);
  await getUpstreamMetadata(env, "github", () => {
    throw Error("RETRY_TOO_EARLY");
  });
});
test("cold 429 displays actionable error, preserves safe stage and blocks early retries", async () => {
  const env = environment();
  const normal = githubFetch();
  let requests = 0;
  const limited = (url, init) => {
    requests++;
    return String(url) === authMetadata
      ? new Response(null, { status: 429, headers: { "retry-after": "90" } })
      : normal(url, init);
  };
  const response = await handleUpstreamRoutes(
    new Request(startUrl),
    env,
    limited,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "90");
  const body = await response.text();
  assert.match(body, /OAUTH_HTTP_429/);
  assert.match(body, /90 segundos/);
  assert.ok(!body.includes(env.ASSISTENTE_OAUTH_PASSWORD));
  assert.equal(requests, 3);
  await assert.rejects(
    getUpstreamMetadata(env, "github", () => {
      throw Error("RETRY_TOO_EARLY");
    }),
    (error) =>
      error.httpStatus === 429 &&
      error.endpointKind === "authorization_metadata",
  );
});
test("metadata cache expires absolutely and cannot hide security or authorization errors", async () => {
  for (const [age, status] of [
    [86401000, 429],
    [3601000, 403],
  ]) {
    const env = environment();
    const normal = githubFetch();
    await getUpstreamMetadata(env, "github", normal);
    await stale(env, age);
    await assert.rejects(
      getUpstreamMetadata(env, "github", (url, init) =>
        String(url) === authMetadata
          ? new Response(null, { status })
          : normal(url, init),
      ),
      (error) => error.httpStatus === status,
    );
  }
  const env = environment();
  await getUpstreamMetadata(env, "github", githubFetch());
  await stale(env, 3601000);
  const normal = githubFetch();
  await assert.rejects(
    getUpstreamMetadata(env, "github", (url, init) =>
      String(url) === authMetadata
        ? Response.json({
            issuer: "https://attacker.example",
            authorization_endpoint: "https://attacker.example/auth",
            token_endpoint: "https://attacker.example/token",
          })
        : normal(url, init),
    ),
    /UNTRUSTED_OAUTH_ENDPOINT/,
  );
});
test("untrusted cached endpoints never receive requests", async () => {
  const env = environment();
  await getUpstreamMetadata(env, "github", githubFetch());
  const key = upstreamDiscoveryCacheKey("github");
  const record = JSON.parse(await env.OAUTH_KV.get(key));
  record.metadata.token_endpoint = "https://attacker.example/token";
  await env.OAUTH_KV.put(key, JSON.stringify(record));
  const normal = githubFetch();
  let requests = 0;
  const result = await getUpstreamMetadata(env, "github", (url, init) => {
    assert.notEqual(new URL(url).host, "attacker.example");
    requests++;
    return normal(url, init);
  });
  assert.equal(
    result.token_endpoint,
    "https://github.com/login/oauth/access_token",
  );
  assert.equal(requests, 3);
});
test("simultaneous cold discovery calls share one HTTP sequence", async () => {
  const env = environment();
  const normal = githubFetch();
  let requests = 0;
  const fetchFn = async (url, init) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 2));
    return normal(url, init);
  };
  await Promise.all(
    Array.from({ length: 8 }, () =>
      getUpstreamMetadata(env, "github", fetchFn),
    ),
  );
  assert.equal(requests, 3);
});

test("both official OAuth providers require explicit S256 metadata", async () => {
  for (const [provider, baseFetch, authorizationMetadata] of [
    ["github", githubFetch, "https://github.com/.well-known/oauth-authorization-server/login/oauth"],
    ["cloudflare", cloudflareFetch, "https://mcp.cloudflare.com/.well-known/oauth-authorization-server"]
  ]) {
    for (const invalid of [undefined, [], ["plain"], "S256", null]) {
      const env = environment();
      const originalFetch = baseFetch();
      const fetchWithoutPkce = async (url, init) => {
        const response = await originalFetch(url, init);
        if (String(url) !== authorizationMetadata) return response;
        const data = await response.json();
        if (invalid === undefined) delete data.code_challenge_methods_supported;
        else data.code_challenge_methods_supported = invalid;
        return Response.json(data);
      };
      await assert.rejects(getUpstreamMetadata(env, provider, fetchWithoutPkce),
        /OAUTH_PKCE_UNSUPPORTED/, provider + " should reject unsupported PKCE metadata");
      assert.equal(await env.OAUTH_KV.get(upstreamDiscoveryCacheKey(provider)), null,
        "unsupported PKCE metadata must not be cached");
    }
    const valid = await getUpstreamMetadata(environment(), provider, baseFetch());
    assert.ok(valid.code_challenge_methods_supported.includes("S256"));
  }
});

test("cached OAuth metadata without PKCE cannot bypass fresh validation", async () => {
  const env = environment();
  const normal = githubFetch();
  await getUpstreamMetadata(env, "github", normal);
  const key = upstreamDiscoveryCacheKey("github");
  const record = JSON.parse(await env.OAUTH_KV.get(key));
  delete record.metadata.code_challenge_methods_supported;
  await env.OAUTH_KV.put(key, JSON.stringify(record));
  let requests = 0;
  const validated = await getUpstreamMetadata(env, "github", (url, init) => {
    requests++;
    return normal(url, init);
  });
  assert.equal(requests, 3);
  assert.ok(validated.code_challenge_methods_supported.includes("S256"));
});
