import assert from "node:assert/strict";
import test from "node:test";
import type { McpClient, McpToolCallResult, McpToolDefinition } from "../src/host/contracts.ts";
import type { McpServerConfiguration } from "../src/host/config.ts";
import { AssistenteHost, AssistenteHostError } from "../src/host/host.ts";

class FakeMcpClient implements McpClient {
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly tools: readonly McpToolDefinition[];
  private readonly shouldFail: boolean;

  constructor(tools: readonly McpToolDefinition[], shouldFail = false) {
    this.tools = tools;
    this.shouldFail = shouldFail;
  }

  async connect(): Promise<void> {
    if (this.shouldFail) throw new Error("private endpoint and token must not leak");
  }

  async listTools(): Promise<readonly McpToolDefinition[]> {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    this.calls.push({ name, args });
    return { content: [{ type: "text", text: `${name} called` }] };
  }

  async close(): Promise<void> {}
}

const configured = (): Extract<McpServerConfiguration, { status: "configured" }> => ({
  id: "cloudflare",
  label: "Cloudflare MCP",
  status: "configured",
  endpoint: "https://cloudflare.example.test/mcp",
  bearerToken: "cloudflare-secret",
});

test("namespaces and routes a Cloudflare MCP tool", async () => {
  const client = new FakeMcpClient([
    { name: "docs", description: "Cloudflare documentation", inputSchema: { type: "object" } },
    { name: "search", description: "Search API schema", inputSchema: { type: "object" } },
    { name: "execute", description: "Call Cloudflare API", inputSchema: { type: "object" } },
  ]);
  const host = new AssistenteHost([configured()], () => client);

  await host.connect();

  assert.deepEqual(host.getTools().map((tool) => tool.name), [
    "mcp_cloudflare__docs",
    "mcp_cloudflare__search",
    "mcp_cloudflare__execute",
  ]);
  await host.callTool("mcp_cloudflare__execute", { code: "return await cf.get('/accounts')" });
  assert.deepEqual(client.calls, [
    { name: "execute", args: { code: "return await cf.get('/accounts')" } },
  ]);
});

test("does not expose a failed remote connection or leak its credentials", async () => {
  const client = new FakeMcpClient(
    [{ name: "execute", inputSchema: { type: "object" } }],
    true,
  );
  const host = new AssistenteHost([configured()], () => client);
  const statuses = await host.connect();

  assert.equal(statuses[0]?.code, "MCP_UNAVAILABLE");
  assert.deepEqual(host.getTools(), []);
  assert.equal(JSON.stringify(statuses).includes("secret"), false);
});

test("does not retry a failed Cloudflare operation", async () => {
  const client = new FakeMcpClient([
    { name: "execute", inputSchema: { type: "object" } },
  ]);
  client.callTool = async (name, args) => {
    client.calls.push({ name, args });
    throw new Error("timeout after a possible write");
  };

  const host = new AssistenteHost([configured()], () => client);
  await host.connect();

  await assert.rejects(
    host.callTool("mcp_cloudflare__execute", { code: "return await cf.post('/accounts')" }),
    (error: unknown) =>
      error instanceof AssistenteHostError && error.code === "MCP_UNAVAILABLE",
  );
  assert.equal(client.calls.length, 1);
});

test("rejects remote tool aliases that collide after normalization", async () => {
  const client = new FakeMcpClient([
    { name: "my.tool", inputSchema: { type: "object" } },
    { name: "my_tool", inputSchema: { type: "object" } },
  ]);
  const host = new AssistenteHost([configured()], () => client);

  const [status] = await host.connect();
  assert.equal(status?.code, "MCP_UNAVAILABLE");
  assert.deepEqual(host.getTools(), []);
});
