import assert from "node:assert/strict";
import test from "node:test";
import {
  createConcurrentResponseCoalescer,
  oauthConsentRequestKey,
} from "../src/shared/concurrent-response.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("coalesces concurrent redirects for one key", async () => {
  const coalescer = createConcurrentResponseCoalescer(2_000);
  const pending = deferred<Response>();
  let calls = 0;

  const execute = () => {
    calls += 1;
    return pending.promise;
  };

  const first = coalescer.run("same", execute);
  const second = coalescer.run("same", execute);
  assert.equal(calls, 1);

  pending.resolve(new Response(null, {
    status: 302,
    headers: { Location: "https://client.example/callback" },
  }));

  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 302);
  assert.equal(b.status, 302);
  assert.equal(a.headers.get("location"), b.headers.get("location"));
});

test("does not retain non-redirect responses", async () => {
  const coalescer = createConcurrentResponseCoalescer(2_000);
  let calls = 0;
  const execute = async () => {
    calls += 1;
    return new Response("retry", { status: 401 });
  };

  assert.equal((await coalescer.run("same", execute)).status, 401);
  assert.equal((await coalescer.run("same", execute)).status, 401);
  assert.equal(calls, 2);
});

test("keeps different keys independent", async () => {
  const coalescer = createConcurrentResponseCoalescer(2_000);
  let calls = 0;
  const execute = async () => {
    calls += 1;
    return new Response(null, { status: 302 });
  };

  await Promise.all([
    coalescer.run("first", execute),
    coalescer.run("second", execute),
  ]);

  assert.equal(calls, 2);
});

test("removes failed executions so a retry can run", async () => {
  const coalescer = createConcurrentResponseCoalescer(2_000);
  let calls = 0;
  const execute = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary failure");
    return new Response(null, { status: 302 });
  };

  await assert.rejects(() => coalescer.run("same", execute));
  assert.equal((await coalescer.run("same", execute)).status, 302);
  assert.equal(calls, 2);
});


test("matches the consent cookie for the current handle when several exist", async () => {
  const handle = "current-consent-handle";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(handle),
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const expected = "__Host-oauth-consent-" + hash.slice(0, 16);

  const request = new Request("https://assistente.example.test/authorize", {
    method: "POST",
    headers: {
      Cookie:
        "__Host-oauth-consent-deadbeefdeadbeef=stale; " +
        expected +
        "=bound",
    },
    body: new URLSearchParams({
      handle,
      decision: "approve",
      password: "not-used-by-the-key",
    }),
  });

  assert.equal(await oauthConsentRequestKey(request), expected);
});

test("does not identify unrelated requests as consent submissions", async () => {
  const request = new Request("https://assistente.example.test/oauth/token", {
    method: "POST",
    headers: {
      Cookie: "__Host-oauth-consent-deadbeefdeadbeef=opaque",
    },
    body: new URLSearchParams({ handle: "unused" }),
  });

  assert.equal(await oauthConsentRequestKey(request), undefined);
});
