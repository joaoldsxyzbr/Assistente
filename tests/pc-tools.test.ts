import test from "node:test";
import assert from "node:assert/strict";
import { PC_TOOL_CATALOG, pcResultToMcp, isPcWrite, isPcTool, validPcArguments } from "../src/mcps/pc/tools.ts";
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
  assert.equal(pcResultToMcp({ ok: true, image: "/".repeat(1_400_001) }).isError, true);
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

test("contrato de loopback deve evitar namespace provisionado no upload inicial", async () => {
  const fs = await import("node:fs/promises");
  const config = JSON.parse(await fs.readFile(new URL("../wrangler.assistente.jsonc", import.meta.url), "utf8"));
  assert.equal(config.durable_objects?.bindings?.some((entry: { name: string }) => entry.name === "PC_RELAY") ?? false, false);
  assert.equal(config.exports?.PcRelay?.storage, "sqlite");
  assert.equal(config.compatibility_flags.includes("enable_ctx_exports"), true);
});

test("validação adicional da fronteira de execução", () => {
  assert.equal(validPcArguments("pc_abrir", { aplicativo: "explorador" }), true);
  assert.equal(validPcArguments("pc_abrir", { aplicativo: "powershell" }), false);
  assert.equal(validPcArguments("pc_clicar", { x: 4, y: 20 }), true);
  assert.equal(validPcArguments("pc_clicar", { x: -1, y: 20 }), false);
  assert.equal(validPcArguments("pc_clicar", { x: 4, y: 20, extra: true }), false);
  assert.equal(validPcArguments("pc_digitar", { texto: "ok" }), true);
  assert.equal(validPcArguments("pc_digitar", { texto: "x".repeat(501) }), false);
  assert.equal(validPcArguments("pc_tecla", { atalho: "WIN+R" }), false);
  assert.equal(validPcArguments("pc_status", {}), true);
});

test("respostas malformadas e excessivas são erros", () => {
  assert.equal(pcResultToMcp({ ok: "true", data: {} }).isError, true);
  assert.equal(pcResultToMcp({ ok: true }).isError, true);
  assert.equal(pcResultToMcp({ ok: true, image: "invalid!" }).isError, true);
  assert.equal(pcResultToMcp({ ok: true, data: "x".repeat(70_000) }).isError, true);
  assert.equal(pcResultToMcp({ ok: true, data: { online: false } }).isError, false);
});

test("parâmetros inválidos não chegam ao Durable Object", async () => {
  let accesses = 0;
  const environment = {
    PC_AGENT_TOKEN: "a".repeat(64),
    PC_RELAY: { idFromName: () => "pc", get: () => {
      accesses++; return { fetch: async () => new Response("{}") };
    } },
  };
  assert.equal((await pcCall(environment, "pc_abrir", { aplicativo: "terminal" })).isError, true);
  assert.equal((await pcCall(environment, "pc_tecla", { atalho: "WIN+R" })).isError, true);
  assert.equal(accesses, 0);
});

test("token inválido não consulta o Durable Object", async () => {
  let accessed = 0;
  const environment = { PC_AGENT_TOKEN: "a".repeat(64),
    PC_RELAY: { idFromName: () => { accessed++; return "pc"; },
      get: () => { accessed++; return { fetch: async () => new Response("{}") }; } } };
  const request = new Request("https://assistente.test/pc/connect", {
    headers: { Upgrade: "websocket", Authorization: "Bearer wrong" },
  });
  assert.equal((await pcAgentRequest(request, environment)).status, 401);
  assert.equal(accessed, 0);
});
