import assert from "node:assert/strict";
import test from "node:test";
import { readMcpConfigurations } from "../src/host/config.ts";

test("starts with only the Cloudflare MCP as an unconfigured connection", () => {
  const configurations = readMcpConfigurations({});

  assert.deepEqual(configurations.map(({ id, status }) => ({ id, status })), [
    { id: "cloudflare", status: "unconfigured" },
  ]);
});

test("loads the Cloudflare MCP endpoint and service credential", () => {
  const configurations = readMcpConfigurations({
    MCP_CLOUDFLARE_URL: "https://cloudflare.example.test/mcp",
    MCP_CLOUDFLARE_TOKEN: "cloudflare-service-secret",
  });

  assert.deepEqual(configurations[0], {
    id: "cloudflare",
    label: "Cloudflare MCP",
    status: "configured",
    endpoint: "https://cloudflare.example.test/mcp",
    bearerToken: "cloudflare-service-secret",
  });
});

test("ignores point and expense variables because they are not hub integrations", () => {
  const configurations = readMcpConfigurations({
    MCP_PONTO_URL: "https://ponto.example.test/mcp",
    MCP_PONTO_TOKEN: "point-secret",
    MCP_GASTOS_URL: "https://gastos.example.test/mcp",
    MCP_GASTOS_TOKEN: "expense-secret",
  });

  assert.deepEqual(configurations.map(({ id, status }) => ({ id, status })), [
    { id: "cloudflare", status: "unconfigured" },
  ]);
});

test("marks incomplete or unsafe Cloudflare configuration without exposing values", () => {
  const configurations = readMcpConfigurations({
    MCP_CLOUDFLARE_URL: "http://cloudflare.example.test/mcp",
    MCP_CLOUDFLARE_TOKEN: "secret-that-must-not-appear-in-status",
  });

  assert.deepEqual(configurations[0], {
    id: "cloudflare",
    label: "Cloudflare MCP",
    status: "misconfigured",
    errorCode: "INVALID_ENDPOINT",
  });
  assert.equal(JSON.stringify(configurations).includes("secret"), false);
});

test("rejects Cloudflare endpoint credentials, query strings, and fragments", () => {
  for (const endpoint of [
    "https://user:password@cloudflare.example.test/mcp",
    "https://cloudflare.example.test/mcp?token=secret",
    "https://cloudflare.example.test/mcp#fragment",
  ]) {
    const [configuration] = readMcpConfigurations({
      MCP_CLOUDFLARE_URL: endpoint,
      MCP_CLOUDFLARE_TOKEN: "service-secret",
    });
    assert.equal(configuration?.status, "misconfigured");
  }
});
