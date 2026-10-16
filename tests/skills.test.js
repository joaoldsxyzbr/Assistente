import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const pontoId = "96b39cda-f037-4259-b406-09fea5431469";
const gastosId = "0c6c31c2-f2fd-4f60-9c75-b232019ae63f";

test("skills e documentação estão presentes", async () => {
  for (const file of [
    "README.md", "skills/INSTRUCTIONS.md", "skills/ponto/SKILL.md",
    "skills/ponto/SQL.md", "skills/gastos/SKILL.md",
    "skills/gastos/EXECUCAO.md", "skills/desenvolvimento/SKILL.md"
  ]) assert.ok((await read(file)).length > 100, file);
});

test("IDs canônicos e acesso oficial, sem cruzar bancos", async () => {
  for (const [file, id, other] of [
    ["skills/ponto/SKILL.md", pontoId, gastosId],
    ["skills/gastos/SKILL.md", gastosId, pontoId]
  ]) {
    const contents = await read(file);
    assert.ok(contents.includes(id));
    assert.ok(!contents.includes(other));
    assert.match(contents, /MCP oficial Cloudflare/);
    assert.match(contents, /OAuth/);
  }
});

test("ponto preserva SQL de registro condicional e consultas", async () => {
  const s = await read("skills/ponto/SQL.md");
  for (const token of ["ON CONFLICT(data)", "RETURNING data", "FROM banco_horas", "FROM resumo", "BETWEEN ?1 AND ?2"]) {
    assert.ok(s.includes(token), token);
  }
  assert.match(await read("skills/ponto/SKILL.md"), /sábado/);
});

test("gastos preserva concorrência, centavos e validação", async () => {
  const s = await read("skills/gastos/EXECUCAO.md");
  for (const token of ["RETURNING", "centavos", "movimentacoes_", "conflito", "duplicado"]) {
    assert.ok(s.includes(token), token);
  }
});

test("somente skills, sem runtime próprio ou secrets", async () => {
  for (const path of ["server", "mcps"]) {
    await assert.rejects(readdir(new URL("../" + path + "/", import.meta.url)), { code: "ENOENT" });
  }
  const pkg = JSON.parse(await read("package.json"));
  assert.ok(!pkg.dependencies && !pkg.devDependencies);
  assert.doesNotMatch(await read("README.md"), /MCP_GITHUB_TOKEN|MCP_CLOUDFLARE_TOKEN/);
});
