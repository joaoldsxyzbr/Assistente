import assert from "node:assert/strict";
import test from "node:test";
import type { McpClient, McpToolCallResult, McpToolDefinition } from "../src/host/contracts.ts";
import type { McpServerConfiguration } from "../src/host/config.ts";
import { AssistenteHost, AssistenteHostError } from "../src/host/host.ts";

class FakeMcpClient implements McpClient {
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  closeCount = 0;
  readonly tools: readonly McpToolDefinition[];
  private readonly shouldFail: boolean;

  constructor(
    tools: readonly McpToolDefinition[],
    shouldFail = false,
  ) {
    this.tools = tools;
    this.shouldFail = shouldFail;
  }

  async connect(): Promise<void> {
    if (this.shouldFail) {
      throw new Error("private endpoint and token must not leak");
    }
  }

  async listTools(): Promise<readonly McpToolDefinition[]> {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    this.calls.push({ name, args });
    return { content: [{ type: "text", text: `${name} called` }] };
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

const configured = (
  id: "ponto" | "gastos",
): Extract<McpServerConfiguration, { status: "configured" }> => ({
  id,
  label: id === "ponto" ? "Controle de ponto" : "Controle de gastos",
  status: "configured",
  endpoint: `https://${id}.example.test/mcp`,
  bearerToken: `${id}-secret`,
});

test("namespaces same-named tools and routes a call only to its MCP", async () => {
  const pointClient = new FakeMcpClient([
    { name: "resumo", description: "Resumo de ponto", inputSchema: { type: "object" } },
  ]);
  const expenseClient = new FakeMcpClient([
    { name: "resumo", description: "Resumo de gastos", inputSchema: { type: "object" } },
  ]);

  const host = new AssistenteHost([configured("ponto"), configured("gastos")], (configuration) =>
    configuration.id === "ponto" ? pointClient : expenseClient,
  );

  await host.connect();

  assert.deepEqual(
    host.getTools().map((tool) => tool.name),
    ["mcp_ponto__resumo", "mcp_gastos__resumo"],
  );

  await host.callTool("mcp_gastos__resumo", { mes: "2026-11" });
  assert.equal(pointClient.calls.length, 0);
  assert.deepEqual(expenseClient.calls, [
    { name: "resumo", args: { mes: "2026-11" } },
  ]);
});

test("one unavailable MCP does not block the others or expose its error", async () => {
  const pointClient = new FakeMcpClient(
    [{ name: "registrar", inputSchema: { type: "object" } }],
    true,
  );
  const expenseClient = new FakeMcpClient([
    { name: "pendencias", inputSchema: { type: "object" } },
  ]);

  const host = new AssistenteHost([configured("ponto"), configured("gastos")], (configuration) =>
    configuration.id === "ponto" ? pointClient : expenseClient,
  );
  const statuses = await host.connect();

  assert.equal(statuses.find((status) => status.id === "ponto")?.code, "MCP_UNAVAILABLE");
  assert.equal(statuses.find((status) => status.id === "gastos")?.code, "READY");
  assert.deepEqual(host.getTools().map((tool) => tool.name), ["mcp_gastos__pendencias"]);
  assert.equal(JSON.stringify(statuses).includes("secret"), false);
});

test("reports unconfigured and invalid MCPs without creating clients", async () => {
  let factoryCalls = 0;
  const host = new AssistenteHost(
    [
      { id: "ponto", label: "Ponto", status: "unconfigured" },
      {
        id: "gastos",
        label: "Gastos",
        status: "misconfigured",
        errorCode: "INCOMPLETE_CONFIGURATION",
      },
    ],
    () => {
      factoryCalls += 1;
      throw new Error("must not be called");
    },
  );

  const statuses = await host.connect();
  assert.equal(factoryCalls, 0);
  assert.deepEqual(statuses.map((status) => status.code), [
    "NOT_CONFIGURED",
    "INVALID_CONFIGURATION",
  ]);
});

test("does not retry a failed call that may have written data", async () => {
  const client = new FakeMcpClient([
    { name: "registrar", inputSchema: { type: "object" } },
  ]);
  client.callTool = async (name, args) => {
    client.calls.push({ name, args });
    throw new Error("timeout after a possible write");
  };

  const host = new AssistenteHost([configured("ponto")], () => client);
  await host.connect();

  await assert.rejects(
    host.callTool("mcp_ponto__registrar", { hora: "06:51" }),
    (error: unknown) =>
      error instanceof AssistenteHostError && error.code === "MCP_UNAVAILABLE",
  );
  assert.equal(client.calls.length, 1);
  assert.equal((await host.getServerStatuses())[0]?.code, "MCP_UNAVAILABLE");
});

test("rejects tool aliases that collide after normalization", async () => {
  const client = new FakeMcpClient([
    { name: "meu.tool", inputSchema: { type: "object" } },
    { name: "meu_tool", inputSchema: { type: "object" } },
  ]);
  const host = new AssistenteHost([configured("ponto")], () => client);

  const [status] = await host.connect();
  assert.equal(status?.code, "MCP_UNAVAILABLE");
  assert.deepEqual(host.getTools(), []);
});
