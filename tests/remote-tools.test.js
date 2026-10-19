import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRemoteResult, selectRemoteTools } from "../server/remote-tools.js";
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

test("official catalog is paginated without sending 95 full schemas", () => {
  const tools = Array.from({ length: 95 }, (_, index) => ({
    name: "tool_" + index,
    description: "Tool number " + index,
    inputSchema: { type: "object", properties: { body: { type: "string", description: "x".repeat(5000) } } }
  }));
  const first = selectRemoteTools(tools);
  assert.equal(first.total, 95);
  assert.equal(first.nextCursor, 20);
  assert.equal(first.tools.length, 20);
  assert.equal(first.tools[0].inputSchema, undefined);
  assert.ok(JSON.stringify(first).length < 10000);
  const last = selectRemoteTools(tools, { cursor: 90, limit: 20 });
  assert.equal(last.tools.length, 5);
  assert.equal(last.nextCursor, null);
  const detail = selectRemoteTools(tools, { name: "tool_37" });
  assert.deepEqual(detail.tool, tools[37]);
  assert.deepEqual(selectRemoteTools(tools, { name: "missing" }), { error: "Ferramenta não encontrada no catálogo oficial." });
  const matches = selectRemoteTools(tools, { query: "number 42" });
  assert.deepEqual(matches.tools.map(item => item.name), ["tool_42"]);
  assert.throws(() => selectRemoteTools(null), /INVALID_TOOL_CATALOG/);
});
test("focused discovery matches words, ranks names and loads only relevant schemas", () => {
  const schema = { type: "object", properties: { path: { type: "string" } }, required: ["path"] };
  const tools = [
    { name: "run_secret_scanning", description: "Scan file contents for secrets", inputSchema: { type: "object" } },
    { name: "get_file_contents", description: "Read repository file", inputSchema: schema, icons: [{ src: "PRIVATE_ICON" }] },
    { name: "get_issue", description: "Read issue data", inputSchema: { type: "object" } }
  ];
  const ranked = selectRemoteTools(tools, { query: "FILE contents" });
  assert.equal(ranked.total, 1);
  assert.deepEqual(ranked.tools.map(item => item.name), ["get_file_contents"]);
  assert.deepEqual(ranked.tools[0].inputSchema, schema);

  const broad = selectRemoteTools(tools, { query: "read" });
  assert.deepEqual(broad.tools.map(item => item.name), ["get_file_contents", "get_issue"]);
  assert.ok(broad.tools.every(item => item.inputSchema === undefined));
  const fallback = selectRemoteTools(tools, { query: "scan secrets" });
  assert.deepEqual(fallback.tools.map(item => item.name), ["run_secret_scanning"]);
  assert.ok(fallback.tools[0].inputSchema);

  const focused = selectRemoteTools(tools, { query: "get file" });
  assert.equal(focused.total, 1);
  assert.deepEqual(focused.tools[0].inputSchema, schema);
  assert.ok(!JSON.stringify(focused).includes("PRIVATE_ICON"));
  assert.deepEqual(selectRemoteTools(tools, { query: "GET_FILE_CONTENTS" }).tools[0].inputSchema, schema);
  assert.deepEqual(selectRemoteTools(tools, { query: "not present" }).tools, []);

  const accented = selectRemoteTools([{ name: "visao_geral", inputSchema: schema }], { query: "VISÃO" });
  assert.deepEqual(accented.tools[0].inputSchema, schema);
});

test("large or broad discovery never loads unrelated full schemas", () => {
  const hugeSchema = { type: "object", properties: { text: { description: "x".repeat(17000) } } };
  const tools = [{ name: "big_tool", inputSchema: hugeSchema }, { name: "small_tool", inputSchema: { type: "object" } }];
  const focused = selectRemoteTools(tools, { query: "big tool" });
  assert.equal(focused.total, 1);
  assert.equal(focused.tools[0].inputSchema, undefined);
  const broad = selectRemoteTools(tools);
  assert.ok(broad.tools.every(item => item.inputSchema === undefined));
  assert.deepEqual(selectRemoteTools(tools, { name: "big_tool" }).tool.inputSchema, hugeSchema);
});
