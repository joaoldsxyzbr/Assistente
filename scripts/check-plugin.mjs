import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const root = new URL("../plugin/", import.meta.url);
const readText = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(readText(path));

const manifest = readJson("plugin.json");
const compat = readJson(".codex-plugin/plugin.json");
const app = readJson(".app.json");

const expectedName = "dev-6ad8b78e1d9881919055627f45ecc43a";
const expectedId = "asdk_app_6ad8b78e1d9881919055627f45ecc43a";
const skillNames = [
  "desenvolvimento",
  "depuracao",
  "planejamento-tecnico",
  "revisao-e-testes",
  "ux-ui",
  "instrucoes-e-comportamento",
  "roteamento",
];

assert.equal(manifest.name, expectedName, "Identidade do plugin alterada");
assert.equal(compat.name, expectedName, "Manifestos divergentes");
assert.equal(manifest.version, compat.version, "Versões divergentes");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "SemVer inválido");
assert.equal(manifest.extensions?.["com.openai"]?.apps, "./.app.json");
assert.equal(compat.apps, "./.app.json");
assert.equal(compat.skills, "./skills");
assert.equal(app.apps?.[expectedName]?.id, expectedId, "App conectado alterado");

const actual = readdirSync(new URL("skills/", root), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
assert.deepEqual(actual, [...skillNames].sort(), "Skills ausentes ou não previstas");

const descriptions = new Map();
for (const name of skillNames) {
  const path = \`skills/\${name}/SKILL.md\`;
  assert.ok(statSync(new URL(path, root)).isFile());
  const contents = readText(path);
  const header = contents.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/);
  assert.ok(header, \`Frontmatter inválido: \${path}\`);
  assert.equal(header[1], name, \`Nome de skill divergente: \${name}\`);
  assert.ok(header[2].length >= 70 && header[2].length <= 400, \`Descrição pouco útil ou longa: \${name}\`);
  descriptions.set(name, header[2].toLowerCase());
  assert.ok(contents.length > header[0].length + 250, \`Instruções insuficientes: \${name}\`);
}

const shouldMention = {
  desenvolvimento: ["implementar", "código", "arquitetura"],
  depuracao: ["erro", "falha", "bug"],
  "planejamento-tecnico": ["plano", "arquitetura", "complexa"],
  "revisao-e-testes": ["revisão", "auditoria", "testes"],
  "ux-ui": ["layout", "telas", "usabilidade"],
  "instrucoes-e-comportamento": ["comunicação", "preferências", "instruções"],
  roteamento: ["roteamento", "diferentes integrações", "não use"],
};
for (const [name, terms] of Object.entries(shouldMention)) {
  for (const term of terms) {
    assert.ok(descriptions.get(name).includes(term), \`Descrição de \${name} sem gatilho: \${term}\`);
  }
}

const routing = readText("skills/roteamento/SKILL.md");
assert.match(routing, /não.*executada antes de todo pedido/i);
assert.match(routing, /GitHub.*Cloudflare/s);
assert.match(routing, /Quando não usar/);
assert.match(readText("skills/desenvolvimento/SKILL.md"), /Outras skills técnicas têm gatilhos próprios/);
assert.match(readText("skills/depuracao/SKILL.md"), /causa/i);
assert.match(readText("skills/ux-ui/SKILL.md"), /acessibilidade/i);

// Validação estática do contrato de descoberta; não simula a seleção do modelo.
console.log(\`Plugin \${manifest.version}: identidade preservada e \${skillNames.length} skills validadas.\`);
