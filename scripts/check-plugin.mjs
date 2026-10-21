import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const root = new URL("../plugin/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const manifest = read("plugin.json");
const compat = read(".codex-plugin/plugin.json");
const app = read(".app.json");

const expectedName = "dev-6ad8b78e1d9881919055627f45ecc43a";
const expectedId = "asdk_app_6ad8b78e1d9881919055627f45ecc43a";

assert.equal(manifest.name, expectedName, "Identidade do plugin alterada");
assert.equal(compat.name, expectedName, "Manifestos com nomes diferentes");
assert.equal(manifest.version, compat.version, "Versões dos manifestos divergentes");
assert.equal(manifest.version, "1.0.4", "Versão inesperada do plugin");
assert.equal(manifest.extensions?.["com.openai"]?.apps, "./.app.json");
assert.equal(compat.apps, "./.app.json");
assert.equal(app.apps?.[expectedName]?.id, expectedId, "ID do app existente alterado");

for (const specialist of ["desenvolvimento", "instrucoes-e-comportamento", "roteamento"]) {
  const location = new URL(`skills/${specialist}/SKILL.md`, root);
  assert.ok(statSync(location).isFile(), `Skill ausente: ${specialist}`);
  const contents = readFileSync(location, "utf8");
  assert.match(contents, /^---\nname:/, `Frontmatter inválido: ${specialist}`);
}

const loadSkill = (name) => readFileSync(new URL(`skills/${name}/SKILL.md`, root), "utf8");
const routing = loadSkill("roteamento");
const behavior = loadSkill("instrucoes-e-comportamento");
const development = loadSkill("desenvolvimento");

assert.match(routing, /^---\\nname: roteamento\\ndescription: [^\\n]+duas ou mais capacidades/i);
assert.match(routing, /Não use para saudações/i);
assert.match(routing, /GitHub.*Cloudflare/s);
assert.match(routing, /Quando não usar/);
assert.match(routing, /não.*intercepta todas as mensagens/i);
assert.match(behavior, /Não use para tarefas técnicas comuns/i);
assert.match(development, /Use em programação/);

console.log("Plugin Assistente: identidade, três skills e contrato de roteamento seletivo OK");
