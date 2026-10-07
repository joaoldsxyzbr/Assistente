import assert from "node:assert/strict";
import test from "node:test";
import { readMcpConfigurations } from "../src/host/config.ts";

test("keeps unconfigured MCPs isolated and reports them without credentials", () => {
  const configurations = readMcpConfigurations({});

  assert.deepEqual(
    configurations.map(({ id, status }) => ({ id, status })),
    [
      { id: "ponto", status: "unconfigured" },
      { id: "gastos", status: "unconfigured" },
      { id: "cloudflare", status: "unconfigured" },
      { id: "deskpilot", status: "unconfigured" },
    ],
  );
});

test("loads an MCP endpoint and token from that domain's variables", () => {
  const configurations = readMcpConfigurations({
    MCP_PONTO_URL: "https://ponto.example.test/mcp",
    MCP_PONTO_TOKEN: "ponto-secret",
  });

  assert.deepEqual(configurations[0], {
    id: "ponto",
    label: "Controle de ponto",
    status: "configured",
    endpoint: "https://ponto.example.test/mcp",
    bearerToken: "ponto-secret",
  });
  assert.equal(configurations[1]?.status, "unconfigured");
});

test("marks incomplete or unsafe server configuration without echoing values", () => {
  const configurations = readMcpConfigurations({
    MCP_PONTO_URL: "http://ponto.example.test/mcp",
    MCP_PONTO_TOKEN: "secret-that-must-not-appear-in-status",
    MCP_GASTOS_TOKEN: "orphan-token",
  });

  assert.deepEqual(configurations[0], {
    id: "ponto",
    label: "Controle de ponto",
    status: "misconfigured",
    errorCode: "INVALID_ENDPOINT",
  });
  assert.deepEqual(configurations[1], {
    id: "gastos",
    label: "Controle de gastos",
    status: "misconfigured",
    errorCode: "INCOMPLETE_CONFIGURATION",
  });
  assert.equal(JSON.stringify(configurations).includes("secret"), false);
});

test("rejects endpoints with credentials, query strings, or fragments", () => {
  for (const endpoint of [
    "https://user:password@ponto.example.test/mcp",
    "https://ponto.example.test/mcp?token=secret",
    "https://ponto.example.test/mcp#fragment",
  ]) {
    const [configuration] = readMcpConfigurations({
      MCP_PONTO_URL: endpoint,
      MCP_PONTO_TOKEN: "secret",
    });
    assert.equal(configuration?.status, "misconfigured");
  }
});
