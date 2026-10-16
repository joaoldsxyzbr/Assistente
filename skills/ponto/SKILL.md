---
name: ponto
description: Instruções de controle de ponto pelo MCP oficial Cloudflare, via Assistente MCPs
---

# Ponto

- Banco D1 canônico: `PONTO_D1_DATABASE_ID` = `96b39cda-f037-4259-b406-09fea5431469`. Não confundir com gastos; se divergir, **não grave**.
- Executor: descubra a ferramenta apropriada em tempo real com `mcp_cloudflare_tools` e chame-a por `mcp_cloudflare_call`. O Worker encaminha ao MCP oficial Cloudflare OAuth; não há binding D1 nem implementação de ferramentas D1 duplicadas.
- `ponto HHMM`: registrar a próxima batida com SQL condicional atômica, sem duplicar ou substituir. Segunda a sexta: entrada, ida_intervalo, volta_intervalo, saida. Sábado: entrada e saida. Domingo sem jornada presumida.
- `ponto hoje`, `ponto ontem`, `ponto DD/MM/AAAA`: consultar a view `banco_horas` na data de America/Sao_Paulo.
- `ponto de DD/MM/AAAA até DD/MM/AAAA`: consultar até 93 dias por vez. `ponto resumo`: consultar a view `resumo`.
- `ponto` isolado: se houver controles funcionais, mostrar horário de Brasília com botões ±1 minuto e registrar somente após clique; caso contrário solicitar horário.
- Antes de escrever, conferir banco, data, horário e ordem. Usar SQL parametrizado com `ON CONFLICT` e `RETURNING`, conforme lógica validada no histórico do repositório. Após timeout, consultar antes de repetir.
- Esta skill guarda apenas instruções, nunca batidas ou credenciais.
