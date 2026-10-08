import test from "node:test";
import assert from "node:assert/strict";
import { PC_TOOL_CATALOG, pcResultToMcp, isPcWrite, isPcTool, validPcArguments } from "../src/mcps/pc/tools.ts";
import { pcAgentRequest, pcCall, pcIsConfigured } from "../src/mcps/pc/gateway.ts";

test("catálogo é limitado e classifica corretamente as ferramentas", () => {
  assert.equal(new Set(PC_TOOL_CATALOG.map((t) => t.name)).size, PC_TOOL_CATALOG.length);
  assert.equal(isPcWrite("pc_status"), false);
  assert.equal(isPcWrite("pc_terminal"), false);
  assert.equal(isPcWrite("pc_ui_elementos"), false);
  assert.equal(isPcWrite("pc_ui_acao"), true);
  assert.equal(isPcTool("pc_tela"), false);
  assert.equal(isPcTool("pc_clicar"), false);
  assert.equal(isPcTool("pc_digitar"), false);
  assert.equal(isPcTool("pc_rolar"), false);
  assert.equal(isPcTool("pc_tecla"), false);
  assert.equal(isPcWrite("pc_digitar"), true);
  assert.equal(isPcTool("pc_exec_shell"), false);
  assert.ok(PC_TOOL_CATALOG.every((tool) => tool.inputSchema.additionalProperties === false));
});

test("imagens são rejeitadas e erros permanecem erros", () => {
  assert.equal(pcResultToMcp({ ok: true, image: "AQID" }).isError, true);
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

test("terminal e UIA possuem contratos estritos", () => {
  assert.equal(validPcArguments("pc_terminal", { comando: "rede" }), true);
  assert.equal(validPcArguments("pc_terminal", { comando: "cmd /c dir" }), false);
  assert.equal(validPcArguments("pc_terminal", { comando: "powershell" }), false);
  assert.equal(validPcArguments("pc_terminal", { comando: "rede", argumento: "/all" }), false);
  assert.equal(validPcArguments("pc_ui_elementos", {}), true);
  assert.equal(validPcArguments("pc_ui_elementos", { extra: true }), false);
  assert.equal(validPcArguments("pc_ui_acao", { alvo: "Salvar", acao: "acionar" }), true);
  assert.equal(validPcArguments("pc_ui_acao", { alvo: "Nome", acao: "preencher", texto: "teste" }), true);
  assert.equal(validPcArguments("pc_ui_acao", { alvo: "Senha", acao: "preencher", texto: "" }), false);
  assert.equal(validPcArguments("pc_ui_acao", { alvo: "Salvar", acao: "acionar", texto: "enganar" }), false);
  assert.equal(validPcArguments("pc_ui_acao", { alvo: "Salvar", acao: "excluir" }), false);
  assert.equal(validPcArguments("pc_ui_acao", { alvo: "X".repeat(101), acao: "acionar" }), false);
  assert.equal(validPcArguments("pc_abrir", { aplicativo: "explorador" }), true);
  assert.equal(validPcArguments("pc_abrir", { aplicativo: "powershell" }), false);
  assert.equal(validPcArguments("pc_pasta", { pasta: "downloads" }), true);
  for (const retired of ["pc_tela", "pc_clicar", "pc_rolar", "pc_digitar", "pc_tecla"]) {
    assert.equal(isPcTool(retired), false);
    assert.equal(validPcArguments(retired, {}), false);
  }
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
  assert.equal((await pcCall(environment, "pc_terminal", { comando: "powershell" })).isError, true);
  assert.equal((await pcCall(environment, "pc_ui_acao", { alvo: "Senha", acao: "preencher" })).isError, true);
  assert.equal((await pcCall(environment, "pc_tela", {})).isError, true);
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
