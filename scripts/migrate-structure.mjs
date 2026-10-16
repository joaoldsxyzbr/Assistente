import { rename, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const md = text => text.replaceAll("§", String.fromCharCode(96));

async function rewrite(file, fn, required = false) {
  const original = await readFile(file, "utf8");
  const updated = fn(original);
  if (required && updated === original) throw new Error("Expected change missing in " + file);
  if (updated !== original) await writeFile(file, updated);
}
await rename("src/host", "server");
await rename("src/shared", "server/shared");
await rename("src/mcps", "mcps");
await rm("src", { recursive: true, force: true });

for (const name of ["config", "contracts", "remote-client", "remote-failure", "worker"]) {
  await rewrite("server/" + name + ".js", x => x.replaceAll("../shared/", "./shared/"));
}
await rewrite("server/worker.js", text => {
  const marker = 'import { audit } from "./shared/audit.js";';
  if (!text.includes(marker)) throw new Error("Worker import marker missing");
  text = text.replace(marker, marker + '\nimport { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";');
  const oldCtor = 'new McpServer({ name: "assistente", version: "0.1.0" });';
  if (!text.includes(oldCtor)) throw new Error("MCP server constructor marker missing");
  text = text.replace(oldCtor, 'new McpServer({ name: "assistente", version: "0.1.0" }, { instructions: MCP_SERVER_INSTRUCTIONS });');
  const toolMarker = '  const cloudflareConfiguration = configurations.find(';
  if (!text.includes(toolMarker)) throw new Error("MCP tool insertion marker missing");
  const toolLines = [
    '  server.registerTool(',
    '    "assistente_skill",',
    '    {',
    '      description: "Consulta instrucoes especializadas de ponto, gastos ou desenvolvimento, sem modificar dados. Use sob demanda.",',
    '      inputSchema: fromJsonSchema({',
    '        type: "object",',
    '        properties: { nome: { type: "string", enum: SKILL_NAMES, description: "Nome da skill." } },',
    '        required: ["nome"],',
    '        additionalProperties: false',
    '      }),',
    '      _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }',
    '    },',
    '    async ({ nome }) => ({ content: [{ type: "text", text: SKILL_CONTENTS[nome] ?? "Skill nao encontrada." }] })',
    '  );',
    ''
  ].join("\n");
  return text.replace(toolMarker, toolLines + toolMarker);
}, true);

const testNames = [
 "audit","cloudflare-tools","config","gastos-tools","github-tools",
 "oauth-boundary-diagnostics","oauth-flow","oauth-helpers","ponto-sql",
 "ponto-tools","preview-isolation","remote-failure","retired-integrations","retired-pc"
];
for (const name of testNames) {
  await rewrite("tests/" + name + ".test.js", x => x
    .replaceAll("../src/host/", "../server/")
    .replaceAll("../src/shared/", "../server/shared/")
    .replaceAll("../src/mcps/", "../mcps/")
    .replaceAll("src/host/", "server/")
    .replaceAll("src/shared/", "server/shared/")
    .replaceAll("src/mcps/", "mcps/"));
}
await rewrite("scripts/check-syntax.mjs", x => x.replace(
  '["src", "tests", "scripts"]',
  '["server", "mcps", "skills", "tests", "scripts"]'
), true);
await rewrite("wrangler.assistente.jsonc", x => x.replace(
  '"main": "src/host/worker.js"',
  '"main": "server/worker.js"'
), true);

for (const name of ["README.md", "docs/ARQUITETURA.md"]) {
  await rewrite(name, x => x.replaceAll("src/host/", "server/")
    .replaceAll("src/shared/", "server/shared/")
    .replaceAll("src/mcps/", "mcps/"));
}
await rewrite("README.md", text => {
  text = text.replace(
    "A futura incorporação de instruções operacionais de ponto, gastos e desenvolvimento não depende do plugin Assistente.",
    md("As três skills específicas ficam em §skills/§, com instruções curtas na conexão e conteúdo aprofundado sob demanda, sem depender do plugin Assistente.")
  );
  text = text.replace(
    "npm run check executa typecheck",
    "npm run check executa verificação de sintaxe, sincronização das skills,"
  );
  text = text.replace(
    md("§npm run check§ executa typecheck, testes e build dry-run do Worker."),
    md("§npm run check§ verifica a sintaxe JavaScript, skills sincronizadas, testes e build dry-run do Worker.")
  );
  const section = md([
    "## Organização na raiz",
    "",
    "| Pasta | Responsabilidade |",
    "| --- | --- |",
    "| §mcps/§ | Integrações Cloudflare, GitHub, ponto e gastos |",
    "| §skills/§ | Skills operacionais; fonte em Markdown e catálogo JS gerado |",
    "| §server/§ | Servidor MCP, conexões e OAuth |",
    "| §docs/§ | Documentação e decisões |",
    "| §scripts/§ | Scripts auxiliares e sincronização |",
    "| §tests/§ | Testes automatizados |",
    "| §.github/§ | GitHub Actions |",
    "",
    "**Skills:** edite §skills/<nome>/SKILL.md§ ou §skills/INSTRUCTIONS.md§, depois execute §npm run skills:sync§ e §npm run check§. O §skills/catalog.js§ é gerado, não editado manualmente.",
    "",
    "As orientações curtas são enviadas no handshake MCP; §assistente_skill§ consulta o conteúdo completo sob demanda. A aplicação automática dessas instruções depende do suporte do cliente.",
    ""
  ].join("\n"));
  if (!text.includes("## Arquitetura")) throw new Error("README architecture marker missing");
  return text.replace("## Arquitetura", section + "\n## Arquitetura");
}, true);
await rewrite("docs/ARQUITETURA.md", text => {
  text = text.replace(
    "A migração seletiva das instruções de ponto, gastos e desenvolvimento será feita sem depender do antigo plugin Assistente.",
    md("As instruções de ponto, gastos e desenvolvimento ficam em §skills/§ e são oferecidas pelo MCP sem depender do plugin antigo.")
  );
  const section = md([
    "## Skills incorporadas",
    "",
    "Os arquivos §skills/ponto/SKILL.md§, §skills/gastos/SKILL.md§ e §skills/desenvolvimento/SKILL.md§ guardam apenas procedimentos, não dados pessoais. §skills/INSTRUCTIONS.md§ contém as instruções resumidas enviadas pelo servidor no §initialize§. A ferramenta de leitura §assistente_skill§ retorna uma skill completa sob demanda.",
    "",
    "O script §scripts/sync-skills.mjs§ gera §skills/catalog.js§ diretamente do Markdown. O CI verifica sua sincronização. O suporte do cliente determina se as instruções MCP são incorporadas automaticamente ao contexto; não há garantia de carregamento de todos os Markdown em cada chamada.",
    "",
  ].join("\n"));
  if (!text.includes("## Fluxo MCP")) throw new Error("Architecture marker missing");
  return text.replace("## Fluxo MCP", section + "## Fluxo MCP");
}, true);

const pkg=JSON.parse(await readFile("package.json","utf8"));
pkg.scripts["skills:sync"]="node scripts/sync-skills.mjs";
pkg.scripts["skills:check"]="node scripts/sync-skills.mjs --check";
pkg.scripts.check="npm run syntax && npm run skills:check && npm test && npm run build:workers";
await writeFile("package.json",JSON.stringify(pkg,null,2)+"\n");

const testLines=[
 'import assert from "node:assert/strict";',
 'import test from "node:test";',
 'import { access, readFile } from "node:fs/promises";',
 'import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";',
 '',
 'test("skills sao mantidas em Markdown e disponiveis no catalogo", async () => {',
 '  assert.deepEqual(SKILL_NAMES, ["ponto", "gastos", "desenvolvimento"]);',
 '  for (const name of SKILL_NAMES) {',
 '    const source = await readFile(new URL("../skills/" + name + "/SKILL.md", import.meta.url), "utf8");',
 '    assert.equal(SKILL_CONTENTS[name], source);',
 '  }',
 '  const intro = (await readFile(new URL("../skills/INSTRUCTIONS.md", import.meta.url), "utf8")).trim();',
 '  assert.equal(MCP_SERVER_INSTRUCTIONS, intro);',
 '});',
 '',
 'test("servidor fornece instrucoes MCP e ferramenta de leitura das skills", async () => {',
 '  const source = await readFile(new URL("../server/worker.js", import.meta.url), "utf8");',
 '  assert.ok(source.includes("instructions: MCP_SERVER_INSTRUCTIONS"));',
 '  assert.ok(source.includes("assistente_skill"));',
 '  assert.ok(source.includes("SKILL_CONTENTS[nome]"));',
 '  assert.ok(MCP_SERVER_INSTRUCTIONS.includes("ponto_registrar"));',
 '});',
 '',
 'test("pastas visiveis na raiz e src aposentada", async () => {',
 '  for (const folder of ["mcps", "server", "skills", "scripts", "tests"]) {',
 '    await access(new URL("../" + folder + "/", import.meta.url));',
 '  }',
 '  await assert.rejects(access(new URL("../src/", import.meta.url)), { code: "ENOENT" });',
 '  await assert.rejects(access(new URL("../scripts/migrate-structure.mjs", import.meta.url)), { code: "ENOENT" });',
 '});',
 ''
];
await writeFile("tests/skills.test.js",testLines.join("\n"));

execFileSync("npm", ["run","skills:sync"], {stdio:"inherit"});
console.log("Pastas mcps/, server/ e skills/ atualizadas.");
