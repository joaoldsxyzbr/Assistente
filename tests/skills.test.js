import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";

test("catálogo de skills sincronizado com Markdown", async () => {
  assert.deepEqual(SKILL_NAMES, ["ponto", "gastos", "desenvolvimento"]);
  for (const name of SKILL_NAMES) {
    const content = await readFile(new URL("../skills/" + name + "/SKILL.md", import.meta.url), "utf8");
    assert.equal(SKILL_CONTENTS[name], content);
  }
  const intro = (await readFile(new URL("../skills/INSTRUCTIONS.md", import.meta.url), "utf8")).trim();
  assert.equal(MCP_SERVER_INSTRUCTIONS, intro);
});

test("ponto e gastos descrevem integração oficial OAuth e D1 distinto", async () => {
  const wrangler = JSON.parse(await readFile(new URL("../wrangler.assistente.jsonc", import.meta.url), "utf8"));
  const ids = [wrangler.vars.PONTO_D1_DATABASE_ID, wrangler.vars.GASTOS_D1_DATABASE_ID];
  assert.notEqual(ids[0], ids[1]);
  for (const [name, id, other] of [["ponto", ids[0], ids[1]], ["gastos", ids[1], ids[0]]]) {
    const s = SKILL_CONTENTS[name];
    assert.ok(s.includes(id));
    assert.ok(!s.includes(other));
    assert.match(s, /MCP oficial Cloudflare/);
    assert.match(s, /OAuth/);
    assert.match(s, /não grave|não registrar|não escreva/);
  }
  assert.match(MCP_SERVER_INSTRUCTIONS, /skills de instruções/);
});

test("skill de desenvolvimento mantém fluxo de qualidade", () => {
  const skill = SKILL_CONTENTS.desenvolvimento;
  for (const keyword of ["RED → GREEN → REFACTOR", "causa raiz", "CI", "revisar"]) {
    assert.ok(skill.toLowerCase().includes(keyword.toLowerCase()));
  }
});
