---
name: gastos
description: Instruções de gastos via MCP oficial Cloudflare OAuth
---

# Gastos

- Banco canônico: `GASTOS_D1_DATABASE_ID` = `0c6c31c2-f2fd-4f60-9c75-b232019ae63f`. Se divergente, **não grave**. Nunca utilizar o D1 de ponto.
- Executor: **MCP oficial Cloudflare** conectado diretamente ao ChatGPT via OAuth. Esta skill contém somente procedimentos, não ferramentas próprias.
- `gastos resumo` e `gastos listar`: consultar registros e totais de `movimentacoes_MM_AAAA`. Padrão: **próximo mês** em America/Sao_Paulo; período explícito prevalece.
- `gasto descrição valor`: registrar saída pendente por padrão. `gastos atualizar` e `gastos excluir`: exigir pedido e registro inequívoco.
- Valor armazenado em TEXT: converter BRL válido para centavos inteiros, sem `SUM(valor)` sem validação. Proteger contra duplicatas.
- Leitura não cria tabela. Criação de mês só no primeiro registro autorizado, após validar schema. Atualizações e exclusões devem verificar estado anterior e confirmar com `RETURNING`.
- Após erro ou timeout de escrita, consultar antes de tentar novamente. Se as verificações não puderem ser garantidas no MCP oficial, **não grave**.
- Esta skill não armazena transações, saldos ou credenciais.
