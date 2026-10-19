import assert from "node:assert/strict";
import test from "node:test";
import { observeMcpResponse } from "../server/shared/response-observer.js";

test("JSON response retains status, headers, bytes and completes once", async () => {
  const records = [];
  const src = Response.json({ jsonrpc: "2.0", result: { ok: true } });
  const out = observeMcpResponse(src, { traceId: "trace-json", startedAt: Date.now(), log: (...args) => records.push(args) });
  assert.equal(out.headers.get("content-type"), "application/json");
  assert.equal(out.headers.get("x-assistente-trace-id"), "trace-json");
  assert.deepEqual(await out.json(), { jsonrpc: "2.0", result: { ok: true } });
  assert.equal(records.length, 1);
  assert.equal(records[0][1], "mcp_response_stream");
  assert.equal(records[0][2].phase, "finished");
  assert.equal(records[0][2].transport, "json");
  assert.ok(records[0][2].bytes > 0);
});

test("SSE preserves bytes and reports completed stream", async () => {
  const records = [];
  const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
  const src = new Response(body, { headers: { "content-type": "text/event-stream" } });
  const out = observeMcpResponse(src, { traceId: "sse", log: (...args) => records.push(args) });
  assert.equal(await out.text(), body);
  assert.equal(records[0][2].transport, "sse");
  assert.equal(records[0][2].phase, "finished");
});

test("stream cancellation is not reported as successful delivery", async () => {
  const records = [];
  const src = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1])); }
  }), { headers: { "content-type": "text/event-stream" } });
  const out = observeMcpResponse(src, { log: (...args) => records.push(args) });
  const reader = out.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(records.length, 1);
  assert.equal(records[0][2].phase, "cancelled");
});

test("stream errors never log payload and are not counted as completed", async () => {
  const records = [];
  const src = new Response(new ReadableStream({
    start(controller) { controller.error(new Error("private-token-here")); }
  }));
  const out = observeMcpResponse(src, { log: (...args) => records.push(args) });
  await assert.rejects(out.text(), /MCP_RESPONSE_STREAM_ERROR/);
  assert.equal(records[0][2].phase, "errored");
  assert.doesNotMatch(JSON.stringify(records), /private-token-here/);
});

test("bodyless responses are logged without creating invalid response bodies", () => {
  const records = [];
  const src = new Response(null, { status: 204 });
  const out = observeMcpResponse(src, { log: (...args) => records.push(args) });
  assert.equal(out.status, 204);
  assert.equal(out.body, null);
  assert.equal(records[0][2].phase, "finished");
});
