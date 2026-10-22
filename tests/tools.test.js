import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import { endpointFor, readRemoteConfiguration } from "../server/remote-client.js";
import { githubDirectWriteNames } from "../mcps/github/tools/contratos.js";
import { cloudflareTools } from "../mcps/cloudflare/tools/contratos.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("publica somente ferramentas proprias GitHub e Cloudflare", async () => {
  const server = await read("server/mcp-server.js");
  assert.match(server, /assistente_status/);
  assert.match(server, /registerGithubDirectTools/);
  assert.match(server, /registerCloudflareTools/);
  assert.match(server, /registerGithubExactEdit/);
  assert.match(server, /registerGithubRelocation/);
  assert.doesNotMatch(server, /registerRemoteTools|mcp_github_call|mcp_cloudflare_call/);
  assert.deepEqual(githubDirectWriteNames, ["github_criar_branch", "github_criar_pr"]);
  assert.equal(cloudflareTools.length, 4);
  assert.equal((server.match(/server\.registerTool\(/g) || []).length, 1);
});

test("usa servidores oficiais por OAuth somente internamente", async () => {
  assert.equal(endpointFor("github"), "https://api.githubcopilot.com/mcp/x/all");
  assert.equal(endpointFor("cloudflare"), "https://mcp.cloudflare.com/mcp");
  assert.equal(endpointFor("unknown"), null);
  assert.equal(await readRemoteConfiguration({}, "github"), null);
});

test("skills seguem fora do repositorio", async () => {
  for (const path of ["skills", "scripts/sync-skills.mjs", "tests/skill-mcp.test.js", "tests/skill-sql.test.js", "tests/skills.test.js"]) {
    await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
  }
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts["skills:sync"], undefined);
  assert.equal(pkg.scripts["skills:check"], undefined);
  assert.equal(pkg.devDependencies.esbuild, undefined);
  assert.match(pkg.scripts["test:runtime"], /build:workers/);
  const runtimeTest = await read("tests/runtime/worker.test.js");
  assert.doesNotMatch(runtimeTest, /from ["']esbuild["']/);
  assert.match(runtimeTest, /wrangler-build\/assistente/);
});
