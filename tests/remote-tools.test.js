import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRemoteResult } from "../server/remote-tools.js";
import { endpointFor } from "../server/remote-client.js";

function onlyText(result) {
  assert.ok(result.content.every(item => item.type === "text" && typeof item.text === "string"));
  assert.equal(result.structuredContent, undefined);
  assert.equal(result._meta, undefined);
}

test("text stays intact and errors survive normalization", () => {
  const r = normalizeRemoteResult({ isError: true, content: [{ type: "text", text: "Falha remota" }] });
  onlyText(r);
  assert.equal(r.isError, true);
  assert.equal(r.content[0].text, "Falha remota");
});
test("structured JSON stays readable without opaque metadata", () => {
  const r = normalizeRemoteResult({ structuredContent: { rows: [1, 2], _meta: { secret: "hidden" }, bytes: "abc" } });
  onlyText(r);
  assert.deepEqual(JSON.parse(r.content[0].text), { rows: [1, 2], bytes: "[dados binários omitidos]" });
});
test("does not duplicate structured data when upstream has text", () => {
  const r = normalizeRemoteResult({ content: [{ type: "text", text: "{\"ok\":true}" }], structuredContent: { ok: true } });
  onlyText(r);
  assert.deepEqual(r.content, [{ type: "text", text: "{\"ok\":true}" }]);
});
test("embedded textual resource becomes text; binary and image are not forwarded", () => {
  const r = normalizeRemoteResult({ content: [
    { type: "resource", resource: { mimeType: "text/plain", uri: "file:///tmp/readme", text: "hello" } },
    { type: "image", data: "VERY_PRIVATE_BASE64", mimeType: "image/png" },
    { type: "resource", resource: { mimeType: "application/octet-stream", blob: "PRIVATE_BLOB" } }
  ] });
  onlyText(r);
  const s = JSON.stringify(r);
  assert.match(s, /hello/);
  assert.doesNotMatch(s, /VERY_PRIVATE_BASE64|PRIVATE_BLOB/);
});
test("resource links are text-only and signed links are withheld", () => {
  const r = normalizeRemoteResult({ content: [
    { type: "resource_link", name: "docs", uri: "https://example.com/page" },
    { type: "resource_link", name: "signed", uri: "https://example.com/?token=private" }
  ] });
  onlyText(r);
  assert.match(r.content[0].text, /https:\/\/example.com\/page/);
  assert.doesNotMatch(JSON.stringify(r), /token=private/);
});
test("large response is rejected rather than silently truncated", () => {
  const r = normalizeRemoteResult({ content: [{ type: "text", text: "a".repeat(70000) }] });
  onlyText(r);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /64 KiB/);
  assert.ok(JSON.stringify(r).length < 300);
});
test("invalid blocks are rejected without exposing raw payload", () => {
  for (const input of [null, { content: "invalid" }, { content: [null] }]) {
    const r = normalizeRemoteResult(input);
    onlyText(r);
    assert.equal(r.isError, true);
  }
});
test("remote client selects official MCP endpoints", () => {
  assert.equal(endpointFor("github"), "https://api.githubcopilot.com/mcp/x/all");
  assert.equal(endpointFor("cloudflare"), "https://mcp.cloudflare.com/mcp");
  assert.equal(endpointFor("unknown"), null);
});
