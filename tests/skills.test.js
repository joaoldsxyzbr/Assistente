import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";

test("skills sao mantidas em Markdown e disponiveis no catalogo", async () => {
  assert.deepEqual(SKILL_NAMES, ["ponto", "gastos", "desenvolvimento"]);
  for (const name of SKILL_NAMES) {
    const source = await readFile(new URL("../skills/" + name + "/SKILL.md", import.meta.url), "utf8");
    assert.equal(SKILL_CONTENTS[name], source);
  }
  const intro = (await readFile(new URL("../skills/INSTRUCTIONS.md", import.meta.url), "utf8")).trim();
  assert.equal(MCP_SERVER_INSTRUCTIONS, intro);
});

test("servidor fornece instrucoes MCP e ferramenta de leitura das skills", async () => {
  const source = await readFile(new URL("../server/worker.js", import.meta.url), "utf8");
  assert.ok(source.includes("instructions: MCP_SERVER_INSTRUCTIONS"));
  assert.ok(source.includes("assistente_skill"));
  assert.ok(source.includes("SKILL_CONTENTS[nome]"));
  assert.ok(MCP_SERVER_INSTRUCTIONS.includes("ponto_registrar"));
});

test("pastas visiveis na raiz e src aposentada", async () => {
  for (const folder of ["mcps", "server", "skills", "scripts", "tests"]) {
    await access(new URL("../" + folder + "/", import.meta.url));
  }
  await assert.rejects(access(new URL("../src/", import.meta.url)), { code: "ENOENT" });
  await assert.rejects(access(new URL("../scripts/migrate-structure.mjs", import.meta.url)), { code: "ENOENT" });
});
