import assert from "node:assert/strict";
import test from "node:test";
import { readMcpConfigurations } from "../src/host/config.ts";

test("starts with Cloudflare and GitHub as unconfigured connections", () => {
  const configurations = readMcpConfigurations({});

  assert.deepEqual(configurations.map(({ id, status }) => ({ id, status })), [
    { id: "cloudflare", status: "unconfigured" },
    { id: "github", status: "unconfigured" },
  ]);
});

test("loads the Cloudflare MCP endpoint and service credential", () => {
  const configurations = readMcpConfigurations({
    MCP_CLOUDFLARE_URL: "https://mcp.cloudflare.com/mcp",
    MCP_CLOUDFLARE_TOKEN: "cloudflare-service-secret",
  });

  assert.deepEqual(configurations[0], {
    id: "cloudflare",
    label: "Cloudflare MCP",
    status: "configured",
    endpoint: "https://mcp.cloudflare.com/mcp",
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
    { id: "github", status: "unconfigured" },
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
    "https://mcp.cloudflare.com/mcp?token=secret",
    "https://mcp.cloudflare.com/mcp#fragment",
  ]) {
    const [configuration] = readMcpConfigurations({
      MCP_CLOUDFLARE_URL: endpoint,
      MCP_CLOUDFLARE_TOKEN: "service-secret",
    });
    assert.equal(configuration?.status, "misconfigured");
  }
});

test("rejects token forwarding to an unexpected HTTPS server", () => {
  const cases = [
    { MCP_CLOUDFLARE_URL: "https://attacker.example/mcp", MCP_CLOUDFLARE_TOKEN: "secret", id: "cloudflare" },
    { MCP_GITHUB_URL: "https://attacker.example/mcp", MCP_GITHUB_TOKEN: "secret", id: "github" },
    { MCP_GITHUB_URL: "https://api.githubcopilot.com/other", MCP_GITHUB_TOKEN: "secret", id: "github" },
  ];
  for (const env of cases) {
    const record = readMcpConfigurations(env).find(({ id }) => id === env.id);
    assert.equal(record?.status, "misconfigured");
    assert.equal(JSON.stringify(record).includes("secret"), false);
  }
});
