# Qualidade e seleção das skills do Assistente — 1.2.0

## Base técnica
O Superpowers (https://github.com/obra/superpowers) utiliza investigação sistemática, desenvolvimento dirigido por testes, execução verificada de planos, revisão antes de merge e evidências antes de declarar conclusão. A adaptação conserva esses princípios e respeita o ambiente ChatGPT: não tenta instalar hooks para interceptar toda conversa e não pressupõe subagentes.

## Padrão adotado
- Pedido claro e simples: responder ou usar uma única skill, sem carregar rotinas desnecessárias.
- Requisitos incompletos: descoberta de requisitos → plano técnico somente se complexo.
- Bug: depuração (reproduzir → causa raiz → hipótese → teste de regressão → fix → verificar).
- Nova lógica: desenvolvimento e TDD (RED → GREEN → REFACTOR), ressalvados protótipos e UI não automatizável.
- Plano aprovado com várias tarefas: execução por etapas, checkpoints e regressão.
- Auditoria de PR: revisão independente e critérios de aceite, sem escrita salvo pedido explícito.
- Feedback de revisor: verificar tecnicamente antes de aceitar/rejeitar.
- Entrega: portão de evidências, seguido de integração de branches quando solicitada.
- PR + deploy: confirmar GitHub e Cloudflare separadamente. Merge não é deploy.

## Cenários comportamentais para testar manualmente no ChatGPT

| Pedido de teste | Comportamento esperado |
| --- | --- |
| Oi, tudo bem? | Resposta direta; sem skill técnica nem MCP |
| Corrija erro HTTP 500 no login | Depuração, causa raiz, regressão e teste |
| Preciso criar um aplicativo mas ainda não defini o fluxo | Descoberta de requisitos |
| Planeje uma migração complexa sem editar arquivos | Planejamento; sem escrita |
| Implemente esta função já especificada | Desenvolvimento + TDD se testável |
| Escreva o teste primeiro, veja falhar, depois implemente | TDD; saídas RED/GREEN comprovadas |
| Execute o plano aprovado em etapas | Execução; checkpoints por tarefa |
| Faça auditoria da main sem alterar | Revisão e testes; somente leitura |
| Um revisor pediu mudar autenticação, confira a sugestão | Revisão de feedback antes de aceitar |
| Está 100% funcionando? | Verificação de entrega; não alegar sucesso sem evidência |
| Integre o PR depois de todos os checks | Integração de branches; confirmar status remoto |
| Redesenhe a tela de recebimento | UX/UI e implementação se autorizada |
| Mude sua maneira de falar | Instruções e comportamento |
| Atualize o repositório e publique Worker | Coordenação GitHub + Cloudflare, com validação |
| Qual é a previsão de amanhã? | Recurso climático adequado, sem MCPs de engenharia |

## Gates de qualidade

1. Identidade existente do plugin e vínculo com App preservados; nenhuma permissão adicional.
2. 13 arquivos de skill válidos e descrições de descoberta específicas.
3. Testes nativos de contrato para gatilhos e garantias estáticas (não tentam imitar o modelo).
4. GitHub CI verde: scripts de sintaxe, teste de plugin, testes automatizados, navegador e runtime Worker.
5. Relatório honesto de validações ausentes: descoberta real pelo ChatGPT só é aferida no próprio host.

## Limites
Skills melhoram procedimentos, mas não equivalem a mecanismos internos do Superpowers em Claude Code (hooks, worktrees nativos e subagentes). Só usar essas ferramentas se o ambiente oferecer acesso e houver autorização. Mantemos JS/Python/C#, HTML/CSS/SQL e APIs nativas/SDKs oficiais, sem novas dependências comunitárias.

Fontes: https://github.com/obra/superpowers/tree/main/skills ; https://developers.openai.com/plugins/build/skills
