import assert from "node:assert/strict";
import test from "node:test";
import { safeResult } from "../server/remote-tools.js";

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
