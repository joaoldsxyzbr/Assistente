import assert from "node:assert/strict";
import test from "node:test";
import { classifyRemoteFailure, remoteFailure, invokeRemoteTool, normalizeRemoteResult, selectRemoteTools, listAllRemoteTools } from "../server/remote-tools.js";
import { endpointFor, upstreamFetchTimeoutMs } from "../server/remote-client.js";
import { MAX_PUSH_BYTES, MAX_PUSH_FILES, remoteCallMetrics, remoteCallTimeout } from "../server/shared/batch-policy.js";

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

test("exact tool details exclude provider icons and unnecessary metadata", () => {
  const icon = "base64image".repeat(6500);
  const schema = { type: "object", properties: { path: { type: "string" } } };
  const tool = {
    name: "get_repository_tree", description: "Read the tree",
    icons: [{ src: icon }], inputSchema: schema,
    outputSchema: { type: "object", description: "large".repeat(2000) },
    annotations: { extra: "private" }
  };
  const result = selectRemoteTools([tool], { name: tool.name });
  assert.deepEqual(result, { tool: { name: tool.name, description: tool.description, inputSchema: schema } });
  assert.ok(JSON.stringify(result).length < 250);
  assert.ok(!JSON.stringify(result).includes(icon.slice(0, 200)));
});

test("oversized exact schema returns a controlled error instead of overflowing 64 KiB", () => {
  const result = selectRemoteTools([{
    name: "oversized", inputSchema: { description: "x".repeat(70000) }
  }], { name: "oversized" });
  assert.match(result.error, /Schema MCP grande demais/);
  assert.ok(JSON.stringify(result).length < 250);
});

test("remote catalog reads all paginated pages in order without redundant requests", async () => {
  const calls = [];
  const pages = [
    { tools: [{ name: "first" }], nextCursor: "page-2" },
    { tools: [{ name: "second" }], nextCursor: "page-3" },
    { tools: [{ name: "third" }] }
  ];
  const client = { async listTools(params, options) {
    calls.push({ params, options });
    return pages[calls.length - 1];
  } };
  const found = await listAllRemoteTools(client);
  assert.deepEqual(found.map(tool => tool.name), ["first", "second", "third"]);
  assert.deepEqual(calls, [
    { params: undefined, options: { timeout: 15000 } },
    { params: { cursor: "page-2" }, options: { timeout: 15000 } },
    { params: { cursor: "page-3" }, options: { timeout: 15000 } }
  ]);
  assert.equal(selectRemoteTools(found, { query: "third" }).total, 1);
});

test("remote catalog rejects invalid or repeated cursors and excessive pages", async () => {
  await assert.rejects(
    listAllRemoteTools({ async listTools() { return { tools: [], nextCursor: "repeat" }; } }),
    /INVALID_TOOL_CATALOG_CURSOR/
  );
  await assert.rejects(
    listAllRemoteTools({ async listTools() { return { tools: [] , nextCursor: "later" }; } }, { maxPages: 1 }),
    /CATALOG_PAGINATION_LIMIT/
  );
  await assert.rejects(
    listAllRemoteTools({ async listTools() { return { tools: null }; } }),
    /INVALID_TOOL_CATALOG/
  );
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

test("remote execution calls the official tool directly without listing its catalog", async () => {
  const calls = [];
  const client = {
    listTools() { throw Error("REDUNDANT_LIST_TOOLS"); },
    async callTool(request, options) {
      calls.push({ request, options });
      return { content: [{ type: "text", text: "ok" }] };
    }
  };
  const result = normalizeRemoteResult(await invokeRemoteTool(client, "get_file_contents", { path: "README.md" }));
  assert.equal(result.content[0].text, "ok");
  assert.deepEqual(calls, [{
    request: { name: "get_file_contents", arguments: { path: "README.md" } },
    options: { timeout: 45000 }
  }]);
  await assert.rejects(invokeRemoteTool({
    async callTool() { throw Error("Unknown tool"); },
    listTools() { throw Error("REDUNDANT_LIST_TOOLS"); }
  }, "not_available", {}), /Unknown tool/);
});
test("categorizes errors without leaking upstream secrets or lying about writes", () => {
  const scenarios = [
    [new Error("UPSTREAM_RESPONSE_TOO_LARGE"), "RESPONSE_TOO_LARGE"],
    [new Error("request timed out"), "TIMEOUT"],
    [{ status: 429 }, "RATE_LIMIT"],
    [{ status: 401 }, "AUTHORIZATION"],
    [{ status: 422 }, "VALIDATION"],
    [{ status: 503 }, "UPSTREAM_UNAVAILABLE"],
    [new Error("unexpected PRIVATE_ACCESS_TOKEN_987"), "UNCONFIRMED"]
  ];
  for (const [error, code] of scenarios) {
    assert.equal(classifyRemoteFailure(error), code);
    const result = remoteFailure(error, "github");
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.startsWith("[" + code + "]"));
    assert.match(result.content[0].text, /verifique o estado/i);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ACCESS_TOKEN_987/);
  }
});
test("longer budgets are restricted to GitHub writes and upstream transport", async () => {
  assert.equal(remoteCallTimeout("github", "push_files"), 90000);
  assert.equal(remoteCallTimeout("github", "create_or_update_file"), 90000);
  assert.equal(remoteCallTimeout("github", "get_file_contents"), 45000);
  assert.equal(remoteCallTimeout("cloudflare", "execute"), 45000);
  assert.equal(upstreamFetchTimeoutMs("POST", 90000), 100000);
  assert.equal(upstreamFetchTimeoutMs("POST"), 55000);
  assert.equal(upstreamFetchTimeoutMs("DELETE", 90000), 5000);
  let captured;
  await invokeRemoteTool({
    async callTool(request, options) {
      captured = { request, options };
      return { content: [{ type: "text", text: "ok" }] };
    }
  }, "push_files", { files: [] }, remoteCallTimeout("github", "push_files"));
  assert.equal(captured.options.timeout, 90000);
});

test("GitHub batch preflight is UTF-8 aware and never leaks source content", () => {
  const args = { files: [{ path: "one.js", content: "ç".repeat(20000) }] };
  const result = remoteCallMetrics("github", "push_files", args);
  assert.equal(result.batch, true);
  assert.equal(result.fileCount, 1);
  assert.equal(result.tooLarge, false);
  assert.equal(result.inputBytes, new TextEncoder().encode(JSON.stringify(args)).length);
  assert.deepEqual(Object.keys(result).sort(), ["batch", "fileCount", "inputBytes", "tooLarge"]);
  assert.equal(JSON.stringify(result).includes("ç"), false);
  assert.equal(MAX_PUSH_BYTES, 128 * 1024);
  assert.equal(MAX_PUSH_FILES, 8);

  const tooMany = { files: Array.from({ length: 9 }, (_, n) => ({ path: n + ".js", content: "x" })) };
  assert.equal(remoteCallMetrics("github", "push_files", tooMany).tooLarge, true);
  assert.equal(remoteCallMetrics("github", "push_files", { files: [{ content: "a".repeat(140000) }] }).tooLarge, true);
  assert.equal(remoteCallMetrics("github", "push_files", { files: [{ content: "a".repeat(1000) }] }).tooLarge, false);
  assert.equal(remoteCallMetrics("github", "push_files", { files: Array(8).fill({ content: "a" }) }).tooLarge, false);
  assert.equal(remoteCallMetrics("github", "push_files", {}).tooLarge, false);
  assert.equal(remoteCallMetrics("cloudflare", "execute", tooMany).tooLarge, false);
});