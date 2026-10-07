import assert from "node:assert/strict";
import test from "node:test";
import { createConcurrentResponseCoalescer } from "../src/shared/concurrent-response.ts";
import { consentRequestKey } from "../src/host/worker.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("coalesces concurrent redirect responses for the same key", async () => {
  const coalescer = createConcurrentResponseCoalescer(2_000);
  const response = deferred<Response>();
  let calls = 0;

  const execute = () => {
    calls += 1;
    return response.promise;
  };

  const first = coalescer.run("same", execute);
  const second = coalescer.run("same", execute);

  assert.equal(calls, 1);

  response.resolve(new Response(null, {
    status: 302,
    headers: { Location: "https://client.example/callback" },
  }));

  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  assert.equal(firstResponse.status, 302);
  assert.equal(secondResponse.status, 302);
  assert.equal(
    firstResponse.headers.get("location"),
    secondResponse.headers.get("location"),
  );
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

test("does not coalesce different keys", async () => {
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

test("removes a failed execution so the next request can retry", async () => {
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

test("consent request key uses only the transaction cookie name", () => {
  const first = new Request("https://assistente.example.test/authorize", {
    method: "POST",
    headers: {
      Cookie:
        "__Host-oauth-consent-abc123=first-sensitive-value; other=value",
    },
  });
  const second = new Request("https://assistente.example.test/authorize", {
    method: "POST",
    headers: {
      Cookie:
        "__Host-oauth-consent-abc123=second-sensitive-value; other=changed",
    },
  });

  assert.equal(consentRequestKey(first), "__Host-oauth-consent-abc123");
  assert.equal(consentRequestKey(second), "__Host-oauth-consent-abc123");
});

test("does not coalesce unrelated requests", () => {
  const getRequest = new Request(
    "https://assistente.example.test/authorize",
  );
  const tokenRequest = new Request(
    "https://assistente.example.test/oauth/token",
    {
      method: "POST",
      headers: {
        Cookie: "__Host-oauth-consent-abc123=opaque",
      },
    },
  );

  assert.equal(consentRequestKey(getRequest), undefined);
  assert.equal(consentRequestKey(tokenRequest), undefined);
});
