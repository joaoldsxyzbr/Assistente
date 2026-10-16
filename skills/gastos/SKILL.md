---
name: gastos
description: Procedimentos de controle financeiro pelo MCP oficial Cloudflare com OAuth
---

# Gastos

- Esta skill contém somente instruções. Executor: MCP oficial Cloudflare, conectado diretamente ao ChatGPT por OAuth.
- D1 canônico: `GASTOS_D1_DATABASE_ID` = `0c6c31c2-f2fd-4f60-9c75-b232019ae63f`. Não confundir com ponto. Se o destino divergir, não grave.
- `gastos resumo` e `gastos listar`: consultar a tabela `movimentacoes_MM_AAAA`, com filtros quando solicitados.
- `gasto descrição valor`: registrar saída pendente por padrão, salvo tipo/status explícito. Atualizar e excluir só quando solicitados, usando ID ou descrição inequívoca.
- Período não informado: **próximo mês** na timezone America/Sao_Paulo. Data informada prevalece. Consulta nunca cria tabela.
- Valores `TEXT` devem ser validados e convertidos para centavos inteiros antes de somar; não usar `SUM(valor)` para valores sem validação.
- Evitar duplicatas exatas. Alterações concorrentes devem verificar o estado anterior e o retorno da escrita. Em timeout, consultar antes de repetir.
- Um mês ainda sem tabela só pode ter o schema criado por registro autorizado e após validar o schema da tabela mais recente. Nunca copiar lançamentos.
- Se a operação não puder reproduzir com segurança as verificações pelo MCP oficial, não grave. A skill não armazena gastos, saldos nem credenciais.
