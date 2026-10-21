# Roteamento do Assistente — v1.1.0

## Objetivo
Aproveitar do [Superpowers](https://github.com/obra/superpowers) a descoberta por propósito e workflows de engenharia, sem copiar a regra obrigatória de invocar uma skill antes de **toda** resposta. No ChatGPT, a descoberta é baseada no `name` e `description` de cada `SKILL.md` ([documentação oficial](https://developers.openai.com/plugins/build/skills)). Não implementamos um roteador JavaScript paralelo, pois ele não seria chamado pelo mecanismo de descoberta do produto.

## Seleção esperada

| Exemplo de pedido | Skill principal ou recurso |
| --- | --- |
| "Oi, tudo bem?" | Resposta direta; nenhuma skill obrigatória |
| "Crie um endpoint para autenticação" | `desenvolvimento` |
| "Login retorna HTTP 500, encontre e corrija" | `depuracao` |
| "Planeje a migração para um monorepositório" | `planejamento-tecnico` |
| "Audite o PR 42 sem alterar arquivos" | `revisao-e-testes` |
| "O recebimento está feio, melhore as telas" | `ux-ui` |
| "Mude seu tom de resposta" | `instrucoes-e-comportamento` |
| "Atualize o GitHub e publique na Cloudflare" | `roteamento` e ferramentas oficiais conforme necessário |
| "Melhore a seleção de skills" | `roteamento` |
| "Qual é o clima amanhã?" | Recurso nativo de previsão, sem MCPs de desenvolvimento |
| "Meus gastos do mês" | Somente conector autorizado realmente disponível; não presumir D1 |

## Regras de ativação
- As **sete skills** são descobertas diretamente pelo ChatGPT; `roteamento` não é um interceptador obrigatório.
- Um objetivo técnico claro chama uma skill focada, não necessariamente `desenvolvimento` primeiro.
- Uma tarefa que combina planejamento e implementação pode usar ambas, mas sem recitar um ritual nem carregar todos os métodos.
- Arquivos auxiliares `.md` existentes continuam como referências sob demanda.
- Respeitar escopo e permissões. Não executar gravações a partir de um pedido de análise.
- As skills complementam MCPs; não substituem OAuth, ferramentas nem garantem acesso a recursos externos.

## Validação
- `npm run test:plugin`: checa manifestos, identidade/App ID, nomes, frontmatter, descrições e distinções entre gatilhos.
- `npm test`, `npm run test:browser`, `npm run test:runtime`: garantem que as mudanças não afetaram a ponte MCP.
- **Teste comportamental ainda necessário no ChatGPT:** executar os casos acima, inclusive pedidos indiretos, negativos e ambíguos. Inspecionar quais skills foram carregadas e se houve chamadas desnecessárias. CI verde não comprova esse comportamento.

## Fontes
- https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md
- https://developers.openai.com/plugins/build/skills
- https://developers.openai.com/plugins/concepts/skills
