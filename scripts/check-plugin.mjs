import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const root = new URL("../plugin/", import.meta.url);
const readText = (path) => readFileSync(new URL(path, root), "utf8");
const parseJson = (path) => JSON.parse(readText(path));
const manifest = parseJson("plugin.json");
const compat = parseJson(".codex-plugin/plugin.json");
const app = parseJson(".app.json");
const name = "dev-6ad8b78e1d9881919055627f45ecc43a";
const id = "asdk_app_6ad8b78e1d9881919055627f45ecc43a";
const skills = [
  "depuracao",
  "descoberta-de-requisitos",
  "desenvolvimento",
  "desenvolvimento-orientado-a-testes",
  "execucao-de-planos",
  "instrucoes-e-comportamento",
  "integracao-de-branches",
  "planejamento-tecnico",
  "revisao-de-feedback",
  "revisao-e-testes",
  "roteamento",
  "ux-ui",
  "verificacao-de-entrega",
];

assert.equal(manifest.name, name, "Identidade do plugin modificada");
assert.equal(compat.name, name, "Manifestos com nomes divergentes");
assert.equal(manifest.version, compat.version, "Versões divergentes");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "Versão sem SemVer");
assert.equal(manifest.extensions?.["com.openai"]?.apps, "./.app.json");
assert.equal(compat.apps, "./.app.json");
assert.equal(compat.skills, "./skills");
assert.equal(app.apps?.[name]?.id, id, "Identidade do App alterada");

const dirs = readdirSync(new URL("skills/", root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(dirs, [...skills].sort(), "Conjunto de skills divergente");

const descriptions = new Map();
for (const skill of skills) {
  const path = "skills/" + skill + "/SKILL.md";
  assert.ok(statSync(new URL(path, root)).isFile(), "Skill ausente " + path);
  const content = readText(path);
  const match = content.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/);
  assert.ok(match, "Frontmatter inválido: " + path);
  assert.equal(match[1], skill, "Skill declarada com nome incorreto: " + path);
  assert.ok(match[2].length >= 95 && match[2].length <= 500,
    "Descrição excessivamente curta/longa: " + path);
  assert.match(match[2], /Use/i, "Ausência de gatilho de ativação: " + path);
  assert.ok(content.length > 350, "Instruções insuficientes: " + path);
  descriptions.set(skill, match[2].toLocaleLowerCase("pt-BR"));
}

const gates = {
  "depuracao": [/causa raiz/i, /Hipótese/i, /reproduz/i],
  "desenvolvimento-orientado-a-testes": [/RED/i, /GREEN/i, /REFACTOR/i],
  "execucao-de-planos": [/checkpoints/i, /subagentes/i, /verificacao-de-entrega/i],
  "verificacao-de-entrega": [/evidência/i, /status/i, /testes/i],
  "integracao-de-branches": [/PR/i, /merge/i, /deploy/i],
  "revisao-de-feedback": [/evidência/i, /revisão/i],
};
for (const [skill, requirements] of Object.entries(gates)) {
  const text = readText("skills/" + skill + "/SKILL.md");
  for (const regex of requirements) {
    assert.match(text, regex, "Gate de qualidade ausente em " + skill + ": " + regex);
  }
}

const router = readText("skills/roteamento/SKILL.md");
assert.match(router, /não intercepta mensagens/i);
assert.match(router, /GitHub.*Cloudflare/s);
assert.match(router, /uma.*skill principal/i);
assert.match(readText("README.md"), /13 skills/);
for (const skill of skills) {
  assert.ok(readText("README.md").includes(skill), "README não lista " + skill);
}

console.log("Assistente " + manifest.version + ": App preservado, " +
  skills.length + " skills e gates estáticos verificados.");
