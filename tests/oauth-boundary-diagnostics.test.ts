import assert from "node:assert/strict";
import test from "node:test";
import {
  readSafeOAuthErrorCode,
  recordOAuthBoundary,
  type OAuthDiagnosticStore,
} from "../src/shared/oauth-boundary-diagnostics.ts";

function diagnosticStore() {
  const writes: Array<{
    key: string;
    value: string;
    options?: { expirationTtl?: number };
  }> = [];

  const store: OAuthDiagnosticStore = {
    async put(key, value, options) {
      writes.push({ key, value, options });
    },
  };

  return { store, writes };
}

test("persists only fixed safe OAuth boundary fields", async () => {
  const { store, writes } = diagnosticStore();

  await recordOAuthBoundary(
    store,
    "token_response",
    401,
    "invalid_client",
  );

  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.key, "diagnostic:oauth:token_response");
  assert.deepEqual(writes[0]!.options, { expirationTtl: 3600 });

  const record = JSON.parse(writes[0]!.value) as Record<string, unknown>;
  assert.deepEqual(Object.keys(record).sort(), [
    "code",
    "observedAt",
    "stage",
    "status",
  ]);
  assert.equal(record.stage, "token_response");
  assert.equal(record.status, 401);
  assert.equal(record.code, "invalid_client");
  assert.equal(typeof record.observedAt, "string");
});

test("diagnostic storage failures never change OAuth control flow", async () => {
  const store: OAuthDiagnosticStore = {
    async put() {
      throw new Error("storage unavailable");
    },
  };

  await assert.doesNotReject(() =>
    recordOAuthBoundary(store, "token_request_seen"),
  );
});

test("does not inspect successful response bodies", async () => {
  const response = Response.json({
    result: "opaque-success-payload",
  });

  assert.equal(await readSafeOAuthErrorCode(response), undefined);
  assert.equal(response.bodyUsed, false);
});

test("returns only a safe OAuth error code from an error response", async () => {
  const response = Response.json(
    {
      error: "invalid_grant",
      error_description: "detail that diagnostics must ignore",
      unrelated: "must-not-escape",
    },
    { status: 400 },
  );

  assert.equal(await readSafeOAuthErrorCode(response), "invalid_grant");
  assert.equal(response.bodyUsed, false);
});

test("rejects non-standard error strings from diagnostics", async () => {
  const response = Response.json(
    { error: "invalid client with details" },
    { status: 401 },
  );

  assert.equal(await readSafeOAuthErrorCode(response), undefined);
});
