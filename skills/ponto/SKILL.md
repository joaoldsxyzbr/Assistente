---
name: ponto
description: Procedimentos do controle de ponto pelo MCP oficial Cloudflare com OAuth
---

# Ponto

- Esta skill é somente instrução. Executor: MCP oficial Cloudflare, conectado diretamente ao ChatGPT por OAuth.
- D1 canônico: `PONTO_D1_DATABASE_ID` = `96b39cda-f037-4259-b406-09fea5431469`. Não confundir com gastos. Se o destino divergir, não grave.
- `ponto HHMM` ou `ponto HH:MM`: validar horário, consultar batidas existentes e executar uma única inserção/atualização atômica condicional no D1 autorizado. Segunda a sexta: entrada, ida_intervalo, volta_intervalo e saida; sábado: somente entrada e saida. Sem jornada presumida aos domingos.
- `ponto hoje`, `ponto ontem` ou `ponto DD/MM/AAAA`: consultar a view `banco_horas` para a data em America/Sao_Paulo.
- `ponto de DD/MM/AAAA até DD/MM/AAAA`: consultar período validado de até 93 dias.
- `ponto resumo`: consultar a view `resumo` e distinguir saldo diário do banco acumulado.
- `ponto` isolado: apresentar relógio ajustável ±1 minuto com confirmação, quando disponível; sem controles, pedir o horário. Não registrar antes da confirmação.
- Usar SQL parametrizado e regras atômicas validadas; não improvisar escrita. Conferir `RETURNING` e o estado atual antes de afirmar sucesso. Após timeout, consultar antes de repetir; não sobrescrever nem duplicar batidas.
- Esta skill não armazena batidas, dados pessoais ou credenciais.
