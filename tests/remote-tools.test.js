import assert from "node:assert/strict";
import test from "node:test";
import { safeResult } from "../server/remote-tools.js";
import { endpointFor } from "../server/remote-client.js";

test("MCP proxy preserves official structured output and error state", () => {
  const result = safeResult({
    isError: true,
    content: [{ type: "text", text: "Falha remota" }, { type: "image", data: "ignored", mimeType: "image/png" }],
    structuredContent: { results: [{ database: "canonical", rows: 2 }] }
  });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Falha remota" }]);
  assert.deepEqual(result.structuredContent, { results: [{ database: "canonical", rows: 2 }] });
});

test("remote client selects the official MCP endpoint for each provider", () => {
  assert.equal(endpointFor("github"), "https://api.githubcopilot.com/mcp/x/all");
  assert.equal(endpointFor("cloudflare"), "https://mcp.cloudflare.com/mcp");
  assert.equal(endpointFor("unknown"), null);
});
