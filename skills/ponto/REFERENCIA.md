# Ponto: execução pelo Cloudflare MCP oficial

Consulte [SQL.md](SQL.md) para as consultas parametrizadas e as duas operações atômicas de registro. Primeiro valide `data` e `horario`, escolha o SQL apropriado pelo dia da semana em America/Sao_Paulo, execute via `cloudflare.request` com a conta `924f32dc9eeb8946dc033801c0c17c42` e banco `96b39cda-f037-4259-b406-09fea5431469`. Confirme `success`, `result[0].success` e o `RETURNING`. Não registrar novamente antes de reconciliar uma resposta incerta. Essas referências documentam comportamento, não são servidor nem ferramenta instalada.
