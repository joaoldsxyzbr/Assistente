import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../plugin/skills/", import.meta.url);
function description(name) {
  const text = readFileSync(new URL(name + "/SKILL.md", root), "utf8");
  const match = text.match(/^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/);
  assert.ok(match, "frontmatter ausente: " + name);
  return match[2].toLocaleLowerCase("pt-BR");
}

// Testes de CONTRATO dos gatilhos, não são uma simulação do roteador do ChatGPT.
const cases = [
  ["bug e erro", "depuracao", ["bug", "erro"]],
  ["definir requisitos", "descoberta-de-requisitos", ["funcionalidade", "objetivo"]],
  ["implementar código", "desenvolvimento", ["implementar", "código"]],
  ["TDD", "desenvolvimento-orientado-a-testes", ["tdd", "teste"]],
  ["executar plano", "execucao-de-planos", ["executar", "plano"]],
  ["comportamento", "instrucoes-e-comportamento", ["comunicação", "preferências"]],
  ["merge e release", "integracao-de-branches", ["branch", "release"]],
  ["planejamento", "planejamento-tecnico", ["planejar", "arquitetura"]],
  ["avaliar feedback", "revisao-de-feedback", ["comentários", "revisão"]],
  ["auditoria", "revisao-e-testes", ["auditoria", "revisão"]],
  ["rotear integrações", "roteamento", ["roteamento", "cloudflare"]],
  ["interface", "ux-ui", ["layout", "usabilidade"]],
  ["verificar entrega", "verificacao-de-entrega", ["concluída", "evidências"]],
];

for (const [name, skill, tokens] of cases) {
  test("gatilho declarativo: " + name, () => {
    const d = description(skill);
    for (const token of tokens) {
      assert.ok(d.includes(token), "Skill " + skill + " sem gatilho " + token);
    }
  });
}
test("ativação seletiva não intercepta saudação", () => {
  const routing = description("roteamento");
  assert.match(routing, /não use para saudações/i);
});
test("ciclo TDD não é obrigatório para conteúdo sem lógica", () => {
  const d = description("desenvolvimento-orientado-a-testes");
  assert.match(d, /não force/i);
});
test("roteamento não substitui execução", () => {
  const router = readFileSync(new URL("roteamento/SKILL.md", root), "utf8");
  assert.match(router, /A descoberta de skills é responsabilidade do ChatGPT/i);
  assert.match(router, /não faça chamadas a MCPs em saudações/i);
});
