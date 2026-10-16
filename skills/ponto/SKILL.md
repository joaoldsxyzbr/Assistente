---
name: ponto
description: Procedimentos do controle de ponto e banco de horas no Assistente MCPs
---

# Ponto

## Banco D1 canônico

- Banco de ponto: `PONTO_D1_DATABASE_ID` = `96b39cda-f037-4259-b406-09fea5431469`.
- O valor de referência está em `wrangler.assistente.jsonc`; as ferramentas `ponto_*` devem usar exclusivamente esse banco, resolvido e validado pelo servidor.
- Este ID identifica o destino, **não** é credencial nem autorização para usar SQL genérico.
- Em correções excepcionais via Cloudflare, confirme o ID efetivo do banco antes de qualquer escrita. Se a configuração ou o banco identificado divergirem, **não grave**; investigue primeiro. Nunca direcione ponto ao D1 de gastos.

## Comandos diretos

- `ponto HHMM` ou `ponto HH:MM`: execute uma vez `ponto_registrar` com o horário escolhido. A ferramenta determina automaticamente a próxima batida válida.
- `ponto hoje`: chame `ponto_hoje` e mostre somente o que foi confirmado.
- `ponto ontem` ou `ponto DD/MM/AAAA`: resolva a data em America/Sao_Paulo e chame `ponto_data`; não use SQL genérico.
- `ponto de DD/MM/AAAA até DD/MM/AAAA`: chame `ponto_periodo`. Intervalo máximo: 93 dias, inclusive; datas inválidas e períodos invertidos são rejeitados. Para intervalos maiores, consulte por partes.
- `ponto resumo`: chame `ponto_resumo` e diferencie o banco acumulado do saldo diário.
- `ponto` isolado: quando o ChatGPT oferecer controles funcionais, mostre horário atual de Brasília com ajuste de ±1 minuto e botão de registro. **Não grave antes do clique.** Sem controles funcionais, solicite o horário. Nunca invente a hora.

## Operação segura

- Segunda a sexta: entrada, saída para intervalo, volta e saída final. Sábado: entrada e saída; carga prevista e saldo devem vir do serviço, não desta skill. Não presuma jornada aos domingos.
- Horários só podem ser exibidos como registrados quando retornados pela ferramenta; ausências são pendências, não zeros.
- Resposta de registro bem-sucedido deve ser curta e fiel ao retorno; diferencie `registrado`, `duplicado`, `conflito`, `completo` e `nao_confirmado`.
- Em timeout ou resultado de escrita incerto, consulte `ponto_hoje` para reconciliar antes de cogitar nova escrita. Nunca crie batidas duplicadas por tentativa cega.
- Correções, datas passadas, ausências e ajustes excepcionais exigem verificar o D1 canônico, identificar o registro e obter autorização apropriada; não usar executor genérico no fluxo diário.
- Esta skill guarda **instruções**, jamais batidas, horários pessoais, jornadas individuais, saldos ou dados de acesso.
