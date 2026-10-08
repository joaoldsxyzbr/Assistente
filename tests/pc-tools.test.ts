import test from "node:test";
import assert from "node:assert/strict";
import { PC_TOOL_CATALOG, pcResultToMcp, isPcWrite, isPcTool } from "../src/mcps/pc/tools.ts";
import { pcAgentRequest, pcCall, pcIsConfigured } from "../src/mcps/pc/gateway.ts";

test("catálogo é limitado e classifica corretamente as ferramentas", () => {
  assert.equal(new Set(PC_TOOL_CATALOG.map((t) => t.name)).size, PC_TOOL_CATALOG.length);
  assert.equal(isPcWrite("pc_status"), false);
  assert.equal(isPcWrite("pc_tela"), false);
  assert.equal(isPcWrite("pc_digitar"), true);
  assert.equal(isPcTool("pc_exec_shell"), false);
  assert.ok(PC_TOOL_CATALOG.every((tool) => tool.inputSchema.additionalProperties === false));
});

test("imagem JPEG permanece imagem MCP e erros permanecem erros", () => {
  assert.deepEqual(pcResultToMcp({ ok: true, image: "AQID" }), { isError: false, content: [{ type: "image", data: "AQID", mimeType: "image/jpeg" }] });
  assert.equal(pcResultToMcp({ ok: false, error: "Offline" }).isError, true);
  assert.equal(pcResultToMcp({ ok: true, image: "/".repeat(1_400_001) }).isError, false);
  assert.equal(pcResultToMcp({ unrelated: true }).isError, true);
});

test("PC desconectado da configuração não anuncia ferramenta", async () => {
  assert.equal(pcIsConfigured({ PC_AGENT_TOKEN: "too-short" }), false);
  assert.equal((await pcCall({}, "pc_status", {})).isError, true);
});

test("WebSocket exige token correto antes do acesso ao Durable Object", async () => {
  let calls = 0;
  const stub = { fetch: async () => { calls++; return new Response("unused"); } };
  const environment = { PC_AGENT_TOKEN: "x".repeat(48), PC_RELAY: { idFromName: () => "default", get: () => stub } };
  const invalid = new Request("https://assistente.test/pc/connect", { headers: { Upgrade: "websocket", Authorization: "Bearer invalid" } });
  assert.equal((await pcAgentRequest(invalid, environment)).status, 401);
  assert.equal(calls, 0);
  const absentUpgrade = new Request("https://assistente.test/pc/connect");
  assert.equal((await pcAgentRequest(absentUpgrade, environment)).status, 426);
  assert.equal(calls, 0);
});
