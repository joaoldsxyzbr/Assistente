import assert from "node:assert/strict";
import test from "node:test";
import { enforceRateLimit } from "../server/shared/rate-limit.js";

test("rate limit supports disabled binding for isolated tests", async () => {
  assert.equal(await enforceRateLimit(undefined, "mcp:owner", "mcp_rate_limit"), null);
});
test("native rate limit accepts requests and uses opaque actor keys", async () => {
  let requestedKey;
  const binding = { async limit({ key }) { requestedKey = key; return { success: true }; } };
  assert.equal(await enforceRateLimit(binding, "mcp:owner", "mcp_rate_limit"), null);
  assert.equal(requestedKey, "mcp:owner");
});
test("native rate limit blocks and returns Retry-After without leaking details", async () => {
  const binding = { async limit() { return { success: false }; } };
  const response = await enforceRateLimit(binding, "authorization:unknown", "oauth_rate_limit");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("rate limit backend errors fail closed", async () => {
  const binding = { async limit() { throw Error("private backend failure"); } };
  const response = await enforceRateLimit(binding, "mcp:owner", "mcp_rate_limit");
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private backend failure/);
});
