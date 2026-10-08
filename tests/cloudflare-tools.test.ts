import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUDFLARE_TOOL_CATALOG,
  withDefaultCloudflareAccount,
} from "../src/mcps/cloudflare/tools.ts";
import { MCP_TOOL_CATALOG } from "../src/mcps/catalog.ts";

test("Cloudflare contracts remain unchanged and the hub also registers GitHub", () => {
  assert.deepEqual(CLOUDFLARE_TOOL_CATALOG.map(({ name }) => name), [
    "docs",
    "search",
    "execute",
  ]);
  assert.deepEqual(MCP_TOOL_CATALOG.filter(({ serverId }) => serverId === "cloudflare")
    .map(({ name }) => name), ["docs", "search", "execute"]);
  assert.ok(MCP_TOOL_CATALOG.some(({ serverId }) => serverId === "github"));
});

test("the Cloudflare API executor is marked as potentially writing", () => {
  const execute = CLOUDFLARE_TOOL_CATALOG.find(({ name }) => name === "execute");

  assert.equal(execute?.isWrite, true);
  assert.deepEqual(execute?.inputSchema.required, ["code"]);
});

test("injects the configured Cloudflare account only when execute has no account", () => {
  const args = { code: "return 1" };

  assert.deepEqual(
    withDefaultCloudflareAccount("execute", args, " account-123 "),
    { code: "return 1", account_id: "account-123" },
  );
  assert.deepEqual(
    withDefaultCloudflareAccount(
      "execute",
      { code: "return 1", account_id: "explicit" },
      "account-123",
    ),
    { code: "return 1", account_id: "explicit" },
  );
  assert.deepEqual(
    withDefaultCloudflareAccount(
      "execute",
      { code: "return 1", account_id: "   " },
      "account-123",
    ),
    { code: "return 1", account_id: "account-123" },
  );
  assert.deepEqual(
    withDefaultCloudflareAccount("docs", { query: "Workers" }, "account-123"),
    { query: "Workers" },
  );
});
