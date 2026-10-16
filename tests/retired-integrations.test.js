import assert from "node:assert/strict";
import test from "node:test";
import { MCP_TOOL_CATALOG } from "../mcps/catalog.js";
import { readMcpConfigurations } from "../server/config.js";
test("retired Penpot is not published, even if legacy environment variables remain", () => {
  const configurations = readMcpConfigurations({
    MCP_PENPOT_URL: "https://design.penpot.app/mcp/stream",
    MCP_PENPOT_TOKEN: "old-secret"
  });
  assert.deepEqual(configurations.map((connection) => connection.id), ["cloudflare", "github"]);
  assert.equal(MCP_TOOL_CATALOG.some((tool) => String(tool.serverId) === "penpot"), false);
  assert.equal(JSON.stringify(configurations).includes("old-secret"), false);
});
