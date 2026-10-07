import assert from "node:assert/strict";
import test from "node:test";
import { audit } from "../src/shared/audit.ts";

test("audit keeps only allowlisted metadata", () => {
  const messages: string[] = [];
  const original = console.log;
  console.log = (message?: unknown) => messages.push(String(message));

  try {
    audit("info", "mcp_request", {
      status: 200,
      write: false,
      outcome: "accepted",
      payload: "blocked",
      secret: "blocked",
    });
  } finally {
    console.log = original;
  }

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]!), {
    event: "mcp_request",
    status: 200,
    write: false,
    outcome: "accepted",
  });
});
