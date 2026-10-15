import assert from "node:assert/strict";
import test from "node:test";
import { PENPOT_TOOL_CATALOG } from "../src/mcps/penpot/tools.ts";
import { MCP_TOOL_CATALOG } from "../src/mcps/catalog.ts";
import { readMcpConfigurations } from "../src/host/config.ts";
import { remoteMcpHeaders, remoteMcpUrl } from "../src/host/remote-client.ts";

test("Penpot exposes only the four supported hosted MCP tools", () => {
  assert.deepEqual(PENPOT_TOOL_CATALOG.map((tool) => tool.name), [
    "high_level_overview", "penpot_api_info", "execute_code", "export_shape",
  ]);
  assert.equal(PENPOT_TOOL_CATALOG.filter((tool) => tool.isWrite).map((t) => t.name).join(","), "execute_code");
  assert.equal(PENPOT_TOOL_CATALOG.every((tool) => tool.serverId === "penpot"), true);
  assert.equal(PENPOT_TOOL_CATALOG.every((tool) => tool.inputSchema.additionalProperties === false), true);
  assert.deepEqual(MCP_TOOL_CATALOG.filter((tool) => tool.serverId === "penpot").map((t) => t.name), PENPOT_TOOL_CATALOG.map((t) => t.name));
});

test("Penpot token is encoded in URL only, never passed as bearer", () => {
  const [config] = readMcpConfigurations({
    MCP_PENPOT_URL: "https://design.penpot.app/mcp/stream",
    MCP_PENPOT_TOKEN: "test-secret+with&special?",
  }).filter((c) => c.id === "penpot");
  assert.equal(config?.status, "configured");
  if (config?.status !== "configured") throw new Error("Expected configured Penpot");
  assert.deepEqual(remoteMcpHeaders(config), {});
  const url = remoteMcpUrl(config);
  assert.equal(url.origin, "https://design.penpot.app");
  assert.equal(url.pathname, "/mcp/stream");
  assert.equal(url.searchParams.get("userToken"), "test-secret+with&special?");
  assert.equal(url.searchParams.size, 1);
  assert.equal(remoteMcpHeaders(config).Authorization, undefined);
});

test("Penpot absent secret disables tools and rejects unsafe endpoints", () => {
  const missing = readMcpConfigurations({ MCP_PENPOT_URL: "https://design.penpot.app/mcp/stream" }).find((c) => c.id === "penpot");
  assert.equal(missing?.status, "misconfigured");
  const cases = [
    "http://design.penpot.app/mcp/stream",
    "https://evil.example/mcp/stream",
    "https://design.penpot.app/mcp/stream?userToken=leak",
    "https://design.penpot.app/mcp/stream#fragment",
    "https://design.penpot.app/other",
  ];
  for (const endpoint of cases) {
    const conf = readMcpConfigurations({ MCP_PENPOT_URL: endpoint, MCP_PENPOT_TOKEN: "penpot-do-not-leak" }).find((c) => c.id === "penpot");
    assert.equal(conf?.status, "misconfigured");
    assert.equal(JSON.stringify(conf).includes("penpot-do-not-leak"), false);
  }
});
