import assert from "node:assert/strict";
import test from "node:test";
import { classifyRemoteCallFailure } from "../src/host/remote-failure.ts";
import {
  MCP_CONNECT_TIMEOUT_MS,
  MCP_TOOL_TIMEOUT_MS,
} from "../src/host/remote-client.ts";

test("connection and tool calls have finite, separate deadlines", () => {
  assert.equal(MCP_CONNECT_TIMEOUT_MS, 15_000);
  assert.equal(MCP_TOOL_TIMEOUT_MS, 45_000);
  assert.ok(MCP_CONNECT_TIMEOUT_MS < MCP_TOOL_TIMEOUT_MS);
});

test("reads and pre-call failures may be retried safely", () => {
  const timeout = new Error("Request timed out");
  assert.deepEqual(classifyRemoteCallFailure(timeout, false, true), {
    outcome: "timeout",
    uncertain: false,
    message: "O MCP de origem demorou além do limite. Confira a conexão e tente novamente.",
  });
  assert.equal(classifyRemoteCallFailure(timeout, true, false).uncertain, false);
  assert.equal(classifyRemoteCallFailure(new Error("connection failed"), false, true).outcome, "failed");
});

test("write failure after starting remote call is always uncertain", () => {
  for (const error of [
    new Error("Request timed out"),
    new Error("network disconnected"),
    new Error("Bearer secret-not-for-users"),
  ]) {
    const failure = classifyRemoteCallFailure(error, true, true);
    assert.equal(failure.outcome, "uncertain");
    assert.equal(failure.uncertain, true);
    assert.ok(failure.message.includes("antes de tentar novamente"));
    assert.equal(failure.message.includes("secret-not-for-users"), false);
  }
});

test("untrusted exceptions are never echoed to the user", () => {
  const failure = classifyRemoteCallFailure(new Error("token=supersecret"), false, true);
  assert.equal(failure.outcome, "failed");
  assert.equal(failure.message.includes("supersecret"), false);
});
