---
name: planejamento-tecnico
description: Use quando o usuário pedir planejar uma funcionalidade complexa, migração, arquitetura ou implementação em várias etapas com dependências e riscos. Para solução ainda ambígua, prefira descoberta-de-requisitos. Não use para ajustes triviais.
---

# Planejamento técnico executável

Um plano serve para **ser executado e verificado**, não para aumentar burocracia. Preserve restrições e decisões anteriores, evitando perguntas já respondidas.

1. **Estado atual:** identifique repositório, branch, ambientes, arquivos relevantes, código e testes existentes. Confirme fatos com ferramentas quando necessário.
2. **Objetivo e limites:** registre comportamento esperado, o que fica fora do escopo, riscos de segurança/dados e critérios mensuráveis de aceitação.
3. **Alternativas:** compare opções somente se uma decisão importante estiver em aberto; escolha a de menor complexidade que atende os requisitos.
4. **Divisão:** produza tarefas pequenas com caminhos de arquivo reais, dependências, entrada/saída e validação independente.
5. **Estratégia de testes:** para comportamento novo, inclua teste que falha antes da implementação, mudança mínima e regressão; para interface, inclua verificação visual se disponível.
6. **Proteção:** use branch de trabalho e checkpoints; descreva rollback quando alterações afetarem produção ou dados.
7. **Execução:** se o usuário autorizou plano **e execução**, encaminhe a `execucao-de-planos`. Se pediu só plano, pare sem escrever ou publicar.

## Formato padrão

**Objetivo → Etapas e arquivos → Critérios de aceitação → Testes → Riscos/reversão.** Para tarefa pequena, uma descrição curta basta. Não invente nomes de arquivos, resultados nem ferramentas.
