import assert from "node:assert/strict";
import test from "node:test";
import { CLOUDFLARE_TOOL_CATALOG } from "../src/mcps/cloudflare/tools.ts";
import { MCP_TOOL_CATALOG } from "../src/mcps/catalog.ts";

test("the hub allowlist contains only the Cloudflare MCP contracts", () => {
  assert.deepEqual(CLOUDFLARE_TOOL_CATALOG.map(({ name }) => name), [
    "docs",
    "search",
    "execute",
  ]);
  assert.deepEqual(MCP_TOOL_CATALOG.map(({ serverId, name }) => ({ serverId, name })), [
    { serverId: "cloudflare", name: "docs" },
    { serverId: "cloudflare", name: "search" },
    { serverId: "cloudflare", name: "execute" },
  ]);
});

test("the Cloudflare API executor is marked as potentially writing", () => {
  const execute = CLOUDFLARE_TOOL_CATALOG.find(({ name }) => name === "execute");

  assert.equal(execute?.isWrite, true);
  assert.deepEqual(execute?.inputSchema.required, ["code"]);
});
