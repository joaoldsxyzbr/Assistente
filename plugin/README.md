# Assistente — versão 1.1.0

Plugin pessoal com especialistas e skills de ativação seletiva, ligado ao app existente que disponibiliza os MCPs GitHub e Cloudflare.

## Descoberta

Cada pasta imediata em `skills/` tem um `SKILL.md` com descrição específica. O modelo decide quais skills ativar conforme a intenção, não através de um roteador obrigatório.

| Skill | Quando usar |
| --- | --- |
| `desenvolvimento` | Implementar código, arquitetura e integrações técnicas |
| `depuracao` | Investigar e corrigir bugs e erros existentes |
| `planejamento-tecnico` | Planejar funcionalidades, migrações e mudanças complexas |
| `revisao-e-testes` | Revisar PRs, auditar e validar qualidade técnica |
| `ux-ui` | Melhorar layout, visual, navegação e usabilidade |
| `instrucoes-e-comportamento` | Preferências, comunicação e instruções |
| `roteamento` | Coordenar tarefas mistas ou analisar a seleção de skills |

Os arquivos `.md` extras em `skills/desenvolvimento/` e `skills/instrucoes-e-comportamento/` continuam como **referências sob demanda**. Não são skills adicionais.

## Identidade, distribuição e limitações

`plugin.json` e `.codex-plugin/plugin.json` preservam o identificador do plugin existente; `.app.json` permanece a conexão com o app já autorizado. O conteúdo deste pacote deve ficar **na raiz do ZIP do plugin**. O servidor MCP/Worker está no mesmo repositório GitHub, mas fora deste pacote; secrets e tokens permanecem fora do ZIP.

A alteração de `SKILL.md` melhora a descoberta, mas **não garante ativação automática universal** nem muda o motor de seleção do ChatGPT. Para preferências válidas em toda conversa, mantenha as instruções personalizadas da conta. Teste com pedidos que devem e não devem ativar cada skill, além de conferir os testes estáticos da CI.

Código-fonte: `joaoldsxyzbr/Assistente-mcps` (`plugin/`); documento de cenários: `docs/ROTEAMENTO-PLUGIN.md` na raiz do repositório.
