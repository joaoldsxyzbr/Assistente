import assert from "node:assert/strict";
import test from "node:test";
import { GITHUB_TOOL_CATALOG } from "../src/mcps/github/tools.ts";
import { MCP_TOOL_CATALOG } from "../src/mcps/catalog.ts";
import { MCP_SERVER_CATALOG } from "../src/host/contracts.ts";
import { readMcpConfigurations } from "../src/host/config.ts";
import { GITHUB_REMOTE_TOOLSETS, remoteMcpHeaders } from "../src/host/remote-client.ts";

test("GitHub tool contracts use the official MCP names and include workflows", () => {
  assert.equal(GITHUB_TOOL_CATALOG.length, 21);
  assert.deepEqual(
    GITHUB_TOOL_CATALOG.map(({ name }) => name),
    [
      "get_me", "search_repositories", "search_code", "get_file_contents",
      "list_branches", "list_commits", "create_branch", "create_or_update_file",
      "push_files", "issue_read", "search_issues", "issue_write",
      "add_issue_comment", "list_pull_requests", "pull_request_read",
      "create_pull_request", "merge_pull_request", "actions_list", "actions_get",
      "actions_run_trigger", "get_job_logs",
    ],
  );
  assert.ok(MCP_TOOL_CATALOG.some(({ serverId }) => serverId === "github"));
});

test("GitHub contracts never hardcode repository or owner", () => {
  for (const contract of GITHUB_TOOL_CATALOG) {
    assert.equal(contract.serverId, "github");
    assert.equal(contract.inputSchema.type, "object");
    assert.equal(contract.inputSchema.additionalProperties, false);
    assert.equal(JSON.stringify(contract).includes("joaoldsxyzbr/Assistente"), false);
    if (contract.name === "get_me" || contract.name.startsWith("search_")) continue;
    assert.ok((contract.inputSchema.required as string[]).includes("owner"));
    assert.ok((contract.inputSchema.required as string[]).includes("repo"));
  }
});

test("write tools require write classification, read tools are separate", () => {
  const writes = GITHUB_TOOL_CATALOG.filter(({ isWrite }) => isWrite).map(({ name }) => name);
  assert.deepEqual(writes, [
    "create_branch", "create_or_update_file", "push_files", "issue_write",
    "add_issue_comment", "create_pull_request", "merge_pull_request",
    "actions_run_trigger",
  ]);
});

test("GitHub uses distinct token and correct upstream toolsets", () => {
  assert.deepEqual(MCP_SERVER_CATALOG.map(({ id }) => id), ["cloudflare", "github"]);
  const configurations = readMcpConfigurations({
    MCP_CLOUDFLARE_URL: "https://mcp.cloudflare.com/mcp",
    MCP_CLOUDFLARE_TOKEN: "cloudflare-secret",
    MCP_GITHUB_URL: "https://api.githubcopilot.com/mcp/",
    MCP_GITHUB_TOKEN: "github-secret",
  });
  assert.equal(configurations[0]?.status, "configured");
  assert.equal(configurations[1]?.status, "configured");
  assert.equal(configurations[1]?.id, "github");
  if (configurations[0]?.status !== "configured" || configurations[1]?.status !== "configured") {
    throw new Error("Unexpected configuration");
  }
  const ghHeaders = remoteMcpHeaders(configurations[1]);
  const cfHeaders = remoteMcpHeaders(configurations[0]);
  assert.equal(ghHeaders.Authorization, "Bearer github-secret");
  assert.equal(cfHeaders.Authorization, "Bearer cloudflare-secret");
  assert.equal(ghHeaders["X-MCP-Toolsets"], GITHUB_REMOTE_TOOLSETS);
  assert.equal(cfHeaders["X-MCP-Toolsets"], undefined);
  assert.equal(GITHUB_REMOTE_TOOLSETS, "context,repos,issues,pull_requests,actions");
});

test("missing Github secret never enables the remote tools", () => {
  const [github] = readMcpConfigurations({
    MCP_GITHUB_URL: "https://api.githubcopilot.com/mcp/",
  }).filter(({ id }) => id === "github");
  assert.equal(github?.status, "misconfigured");
});
