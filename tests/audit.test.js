import assert from "node:assert/strict";
import test from "node:test";
import { audit } from "../server/shared/audit.js";
test("audit keeps only allowlisted metadata", () => {
  const messages = [];
  const original = console.log;
  console.log = (message) => messages.push(String(message));
  try {
    audit("info", "mcp_request", {
      status: 200,
      write: false,
      outcome: "accepted",
      payload: "blocked",
      secret: "blocked"
    });
  } finally {
    console.log = original;
  }
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]), {
    event: "mcp_request",
    status: 200,
    write: false,
    outcome: "accepted"
  });
});
