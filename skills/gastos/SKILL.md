---
name: gastos
description: Procedimentos de gastos, contas e lançamentos no Assistente MCPs
---

# Gastos

## Comandos e período

- Use `gastos_resumo` para totais mensais e pendências e `gastos_listar` para procurar lançamentos/IDs.
- Use `gastos_registrar`, `gastos_atualizar` e `gastos_excluir` somente para ações solicitadas. Não substitua as ferramentas dedicadas por SQL.
- Sem referência de período, **o padrão é o próximo mês**, calculado em `America/Sao_Paulo`. Mês ou ano especificado pelo usuário prevalece.
- Pedido isolado `gasto`: mostre um formulário funcional, se disponível, com tipo, descrição, valor, categoria opcional, status e período; só grave após confirmar. Pedido completo como `gasto internet 89,90` pode executar diretamente quando inequívoco.

## Integridade financeira

- Valores monetários positivos, finitos, com até duas casas decimais; aceitar vírgula decimal brasileira sem inventar arredondamento.
- Novo lançamento é saída/pendente, salvo informação explícita em contrário; não confunda entrada com saída nem pago com pendente.
- Editar ou excluir por descrição exige correspondência inequívoca, preferindo ID; se várias linhas coincidirem, peça identificação.
- Não force lançamentos duplicados; uma segunda transação idêntica exige confirmação explícita. Após timeout/incerteza, consulte `gastos_listar` antes de repetir escrita.
- No resumo, separe total, saldo e pendências conforme retorno real. Orçamento, conta bancária, recorrência e parcelas não são presumidos.
- Esta skill é apenas um procedimento. Não guarde gastos, valores, contas, saldos ou dados pessoais em arquivos.
