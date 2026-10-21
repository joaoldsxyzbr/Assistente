---
name: execucao-de-planos
description: Use quando o usuário já aprovou ou pediu executar um plano técnico com várias tarefas dependentes, checkpoints e testes. Não use para pequenos ajustes diretos nem para planos ainda não definidos.
---

# Execução disciplinada de planos

Execute tarefas pequenas com evidência. O plano é guia verificável, **não** motivo para pedir autorização repetida quando a execução já foi solicitada.

1. **Pré-condições:** confira escopo aprovado, branch/ambiente, dependências e testes de referência. Use branch isolada/PR quando adequado.
2. **Ordem:** divida por entregas testáveis; para cada tarefa anote arquivos, mudança esperada, teste e critério de conclusão.
3. **Implementação:** quando houver comportamento testável, use `desenvolvimento-orientado-a-testes`; não acumule dezenas de alterações sem verificação.
4. **Checkpoints:** após cada entrega, execute testes específicos e registre resultado/decisão. Se o plano não se aplicar ao código real, faça ajuste mínimo documentado e preserve o objetivo.
5. **Revisão:** confira segurança, contratos, diff e requisitos; use `revisao-e-testes` para mudanças maiores ou quando um revisor independente fizer diferença.
6. **Final:** use `verificacao-de-entrega` antes de PR, merge ou publicação; `integracao-de-branches` se houver integração Git.

## Subagentes e paralelismo

- Se o ambiente realmente oferecer agentes delegados, só paralelize tarefas **independentes**, com escopos e arquivos separados. Revise diffs, conflitos e testes de cada entrega.
- Sem ferramenta de subagente, trabalhe **nesta sessão**, por etapas; não invente delegações, logs nem equipes virtuais.
- Limites e ações externas sensíveis continuam dependendo das permissões e da autorização.

**Entrega:** tarefas concluídas, evidências verificadas, pendências e próximos passos (apenas quando existirem).
