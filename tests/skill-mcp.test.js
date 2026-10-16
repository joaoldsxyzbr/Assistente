import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createAssistenteMcpServer } from "../server/mcp-server.js";

test("MCP clients can discover six tools, load complete references and cannot traverse paths", async () => {
  const server = createAssistenteMcpServer({
    PUBLIC_ORIGIN: "https://assistente.example",
  });
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 6);
    for (const [nome, arquivo, expected] of [
      ["ponto", "SQL.md", "WEEKDAY_REGISTER_SQL"],
      ["gastos", "EXECUCAO.md", "D1_QUERY_FAILED"],
    ]) {
      const skill = await client.callTool({
        name: "assistente_skill",
        arguments: { nome },
      });
      assert.ok(skill.content[0].text.includes(arquivo));
      const reference = await client.callTool({
        name: "assistente_skill",
        arguments: { nome, arquivo },
      });
      assert.ok(reference.content[0].text.includes(expected));
    }
    const invalid = await client.callTool({
      name: "assistente_skill",
      arguments: { nome: "ponto", arquivo: "../../package.json" },
    });
    assert.equal(invalid.isError, true);
    const status = await client.callTool({
      name: "assistente_status",
      arguments: {},
    });
    assert.deepEqual(
      JSON.parse(status.content[0].text).connections.map(
        (item) => item.connected,
      ),
      [false, false],
    );
  } finally {
    await client.close();
    await server.close();
  }
});
