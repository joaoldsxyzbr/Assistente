import assert from "node:assert/strict";
import test from "node:test";
import { createConcurrentResponseCoalescer } from "../src/shared/concurrent-response.ts";

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
