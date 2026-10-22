import assert from "node:assert/strict";
import test from "node:test";
import { createToolDiagnostics } from "../server/shared/tool-diagnostics.js";

function harness(write=false) {
  let tick = 100;
  const entries = [];
  const diagnostics = createToolDiagnostics({
    tool: "github_ler_arquivo", provider: "github", traceId: "trace-123",
    write, log: (...args) => entries.push(args), now: () => tick++
  });
  return { diagnostics, entries };
}
test("success uses fixed provider, correlation and duration without content", () => {
  const { diagnostics:d, entries } = harness();
  d.stage("connection"); d.stage("upstream"); d.stage("normalization");
  d.done({ content: [{ type: "text", text: "private-payload" }] });
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1], "tool_execution");
  assert.equal(entries[0][2].server, "github");
  assert.equal(entries[0][2].tool, "github_ler_arquivo");
  assert.equal(entries[0][2].traceId, "trace-123");
  assert.equal(entries[0][2].outcome, "ok");
  assert.equal(entries[0][2].stage, "normalization");
  assert.ok(entries[0][2].durationMs >= 0);
  assert.doesNotMatch(JSON.stringify(entries), /private-payload/);
});
test("missing OAuth and validation errors have distinct safe categories", () => {
  const a=harness();a.diagnostics.stage("oauth");
  a.diagnostics.done({isError:true},{missingAuth:true});
  assert.equal(a.entries[0][2].category,"AUTHORIZATION");
  const b=harness();b.diagnostics.fail(Error("password=very-secret"));
  assert.equal(b.entries[0][2].category,"VALIDATION");
  assert.doesNotMatch(JSON.stringify(b.entries),/very-secret/);
});
test("timeout on writes is uncertain only after upstream attempt", () => {
  const a=harness(true);a.diagnostics.stage("connection");
  a.diagnostics.fail(Error("UPSTREAM_REQUEST_TIMEOUT Bearer token-secret"));
  assert.equal(a.entries[0][2].category,"TIMEOUT");
  assert.equal(a.entries[0][2].uncertain,false);
  const b=harness(true);b.diagnostics.stage("upstream");
  b.diagnostics.fail(Error("UPSTREAM_REQUEST_TIMEOUT"));
  assert.equal(b.entries[0][2].uncertain,true);
});
test("remote isError must not be treated as success or logged with contents", () => {
  const a=harness();a.diagnostics.stage("normalization");
  a.diagnostics.done({isError:true,content:[{type:"text",text:"oauth secret"}]});
  assert.equal(a.entries[0][2].outcome,"error");
  assert.equal(a.entries[0][2].category,"UPSTREAM_ERROR");
  assert.doesNotMatch(JSON.stringify(a.entries),/secret/);
});
test("preview and repeated completion only record once", () => {
  const a=harness(true);a.diagnostics.done({content:[]},{preview:true});
  a.diagnostics.done({isError:true});a.diagnostics.fail(Error("token=secret"));
  assert.equal(a.entries.length,1);
  assert.equal(a.entries[0][2].stage,"preview");
  assert.equal(a.entries[0][2].outcome,"preview");
  assert.equal(a.entries[0][2].uncertain,false);
});
