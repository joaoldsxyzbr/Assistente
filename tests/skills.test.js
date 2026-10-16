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

test("skills de ponto e gastos apontam para os IDs canonicos do Wrangler", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.assistente.jsonc", import.meta.url), "utf8"));
  const pontoId = config.vars?.PONTO_D1_DATABASE_ID;
  const gastosId = config.vars?.GASTOS_D1_DATABASE_ID;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.match(pontoId, uuid);
  assert.match(gastosId, uuid);
  assert.notEqual(pontoId, gastosId);
  for (const [nome, variavel, id, outroId] of [
    ["ponto", "PONTO_D1_DATABASE_ID", pontoId, gastosId],
    ["gastos", "GASTOS_D1_DATABASE_ID", gastosId, pontoId]
  ]) {
    const texto = SKILL_CONTENTS[nome];
    assert.ok(texto.includes(variavel), `${nome}: variavel D1 ausente`);
    assert.ok(texto.includes(id), `${nome}: ID D1 divergente`);
    assert.ok(!texto.includes(outroId), `${nome}: ID do outro banco nao deve aparecer`);
    assert.ok(texto.includes("não grave"), `${nome}: faltou instrução de bloqueio em divergência`);
  }
});

test("skill de desenvolvimento cobre qualidade de ponta a ponta sem burocracia", () => {
  const texto = SKILL_CONTENTS.desenvolvimento;
  for (const tema of ["RED → GREEN → REFACTOR", "causa raiz", "plano", "revisar", "CI", "produção", "mudança pequena"]) {
    assert.ok(texto.toLowerCase().includes(tema.toLowerCase()), `Faltou: ${tema}`);
  }
});
