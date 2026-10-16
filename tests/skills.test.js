import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";
const read = name => readFile(new URL("../" + name, import.meta.url), "utf8");
test("skills correspondem às fontes Markdown", async () => {
  assert.deepEqual(SKILL_NAMES, ["ponto", "gastos", "desenvolvimento"]);
  for (const name of SKILL_NAMES) assert.equal(SKILL_CONTENTS[name], await read("skills/" + name + "/SKILL.md"));
  assert.equal(MCP_SERVER_INSTRUCTIONS, (await read("skills/INSTRUCTIONS.md")).trim());
});
test("Worker publica somente status e leitura das skills", async () => {
  const worker = await read("server/worker.js");
  assert.ok(worker.includes("assistente_status"));
  assert.ok(worker.includes("assistente_skill"));
  assert.equal((worker.match(/server\.registerTool\(/g) || []).length, 2);
  assert.doesNotMatch(worker, /MCP_GITHUB_TOKEN|MCP_CLOUDFLARE_TOKEN/);
});
test("bancos D1 mantêm identidades distintas e skills são oficiais", async () => {
  const config = JSON.parse(await read("wrangler.assistente.jsonc"));
  const ids = ["PONTO_D1_DATABASE_ID","GASTOS_D1_DATABASE_ID"].map(key=>config.vars[key]);
  assert.notEqual(ids[0],ids[1]);
  for (const [name,id,other] of [["ponto",ids[0],ids[1]],["gastos",ids[1],ids[0]]]) {
    assert.ok(SKILL_CONTENTS[name].includes(id));
    assert.ok(!SKILL_CONTENTS[name].includes(other));
    assert.match(SKILL_CONTENTS[name],/MCP oficial Cloudflare/);
  }
});
test("desenvolvimento preserva qualidade", () => {
  for (const term of ["RED → GREEN → REFACTOR","causa raiz","CI","produção"]) assert.ok(SKILL_CONTENTS.desenvolvimento.includes(term));
});
