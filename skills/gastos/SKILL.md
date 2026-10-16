---
name: gastos
description: Instruções de gastos pelo MCP oficial Cloudflare, via Assistente MCPs
---

# Gastos

- Banco canônico: `GASTOS_D1_DATABASE_ID` = `0c6c31c2-f2fd-4f60-9c75-b232019ae63f`. Se divergente, **não grave**. Nunca utilizar o D1 de ponto.
- Executor: descubra a ferramenta apropriada em tempo real com `mcp_cloudflare_tools` e chame-a por `mcp_cloudflare_call`. O Worker encaminha ao MCP oficial Cloudflare OAuth; esta skill não mantém ferramentas D1 próprias.
- `gastos resumo` e `gastos listar`: consultar registros e totais de `movimentacoes_MM_AAAA`. Padrão: **próximo mês** em America/Sao_Paulo; período explícito prevalece.
- `gasto descrição valor`: registrar saída pendente por padrão. `gastos atualizar` e `gastos excluir`: exigir pedido e registro inequívoco.
- Valor armazenado em TEXT: converter BRL válido para centavos inteiros, sem `SUM(valor)` sem validação. Proteger contra duplicatas.
- Leitura não cria tabela. Criação de mês só no primeiro registro autorizado, após validar schema. Atualizações e exclusões devem verificar estado anterior e confirmar com `RETURNING`.
- Após erro ou timeout de escrita, consultar antes de tentar novamente. Se as verificações não puderem ser garantidas no MCP oficial, **não grave**.
- Esta skill não armazena transações, saldos ou credenciais.
- Antes de escrever, consultar `EXECUCAO.md` com `assistente_skill` usando `nome: gastos` e `arquivo: EXECUCAO.md`; as referências são publicadas pelo próprio MCP.
