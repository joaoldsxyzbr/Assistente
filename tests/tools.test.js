import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import { endpointFor, readRemoteConfiguration } from "../server/remote-client.js";
import { remoteToolNames } from "../server/remote-tools.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("worker registra status, MCPs oficiais e ferramentas GitHub seguras", async () => {
  const worker = await read("server/mcp-server.js");
  assert.match(worker, /assistente_status/);
  assert.doesNotMatch(worker, /assistente_skill|skills\/catalog/);
  assert.match(worker, /registerRemoteTools/);
  assert.match(worker, /registerGithubRelocation/);
  assert.match(worker, /registerGithubExactEdit/);
  assert.deepEqual(remoteToolNames, ["mcp_github_call", "mcp_cloudflare_call", "github_relocate_directory", "github_edit_file"]);
  assert.equal((worker.match(/server\.registerTool\(/g) || []).length, 1);
});

test("endpoints oficiais fixos e configuração OAuth lida do KV", async () => {
  assert.equal(endpointFor("github"), "https://api.githubcopilot.com/mcp/x/all");
  assert.equal(endpointFor("cloudflare"), "https://mcp.cloudflare.com/mcp");
  assert.equal(endpointFor("unknown"), null);
  assert.equal(await readRemoteConfiguration({}, "github"), null);
});

test("skills foram removidas por decisão do operador (20/10/2026)", async () => {
  for (const path of ["skills", "scripts/sync-skills.mjs", "tests/skill-mcp.test.js", "tests/skill-sql.test.js", "tests/skills.test.js"]) {
    await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
  }
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts["skills:sync"], undefined);
  assert.equal(pkg.scripts["skills:check"], undefined);
});

