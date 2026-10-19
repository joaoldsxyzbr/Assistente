# Confiabilidade do Assistente MCPs — 19/10/2026

## Objetivo
Melhorar a rastreabilidade e os testes sem mudar o desenho: **JavaScript puro (ES Modules)**, Cloudflare Worker único, OAuth upstream independente e MCPs oficiais. Dados de Ponto e Gastos não são alterados.

## Evidências antes da correção
- Um mesmo `get_file_contents` falhou e teve sucesso em tentativas consecutivas, inclusive para arquivos curtos.
- O Worker registrou `remote_call:ok` e HTTP 200 em algumas tentativas que retornaram erro interno ao ChatGPT.
- O CI testava OAuth e ferramentas locais, mas não percorria `mcp_github_call` até um servidor MCP simulado em Workerd.
- O modo HTTP usado pela Cloudflare é Streamable HTTP; respostas JSON e SSE são válidas. Um HTTP 200, sozinho, não comprova consumo, interpretação ou efeito de uma chamada.

## Mudanças
1. **Correlação:** usa o `traceId` existente da requisição no `remote_call`, `remote_discovery` e no novo `mcp_response_stream`. Inclui header seguro `x-assistente-trace-id`. Jamais registra parâmetros, corpos, tokens ou dados dos bancos.
2. **Ciclo da resposta:** observa conclusão, cancelamento e falha de leitura da resposta HTTP, mantendo os bytes e o `content-type` originais (JSON ou SSE). `finished` significa stream lido; **não significa confirmação de recebimento pelo ChatGPT**.
3. **Diagnóstico:** categoriza erros em `TIMEOUT`, `AUTHORIZATION`, `RATE_LIMIT`, `RESPONSE_TOO_LARGE`, `VALIDATION`, `UPSTREAM_UNAVAILABLE` e `UNCONFIRMED` sem expor mensagens remotas.
4. **Escritas:** nenhuma chamada genérica é repetida automaticamente. Quando o retorno falha, uma escrita pode ter acontecido; confira o estado real no GitHub/Cloudflare antes de repetir. Para arquivos GitHub, prefira SHA esperado nas atualizações e reconciliação do diff antes de novo commit.
5. **Testes:** JSON/SSE, stream concluído/cancelado/erro, erros sanitizados e integração ponta a ponta com provedor simulado em Workerd, incluindo resposta 503 de uma escrita e confirmação de execução única.

## Limites e segurança operacional
- A camada de observação não confirma o recebimento pelo cliente nem garante que o provedor aplicou a escrita. Nesses casos o estado é **incerto**, nunca sucesso presumido.
- Não habilitar retries automáticos de escrita; nem mudanças OAuth, de escopos ou de bancos.
- A causa do erro externo `The tool failed internally` ainda pode envolver a plataforma cliente/gateway; observar métricas após o deploy antes de declarar resolvido.
- Rotação da credencial GitHub antes exposta segue dependente da troca segura no painel de OAuth e no Worker. **Não inserir credenciais em chat, logs ou GitHub.**

## Verificação antes de publicar
`npm run check`, `npm run test:browser`, `npm run test:runtime`; CI do PR concluído e versão carregada depois do merge. Publicar explicitamente apenas após confirmação do build/bindings. Após publicação, consultar `assistente_status`, as skills e chamadas reais apenas de leitura (GitHub `get_me`, `get_file_contents`; Cloudflare `execute` com GET).

## Resultado da entrega
- PR [#90](https://github.com/joaoldsxyzbr/Assistente-mcps/pull/90) integrado a `main`: `9dbae58c6580d49dfbe8b69876429ddfef0b2808`.
- CI do PR [39271936600](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39271936600) e CI da `main` [39272105553](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39272105553) aprovados: sintaxe, sincronização das skills, Node, Chromium, Workerd e build dry-run.
- Cloudflare Worker: versão `a6d42d66-bcda-4364-be39-cf7798729ff0` promovida explicitamente em 19/10/2026 às 14:49 UTC, deployment `d57d35cc-f9b2-48d7-a484-46fe6a6d7f64`, confirmado **100% do tráfego**. Versão anterior para rollback: `9e31b7ba-20ec-42fe-961f-cfd3ad76375a`.
- Comparados 15 bindings/nomes e tipos entre versões: idênticos, incluindo OAuth, KV e rate limiters; valores secretos não foram exibidos.
- Testes reais pós-publicação: `assistente_status`, skill Ponto, GitHub `get_me`, `get_file_contents` (5 leituras consecutivas concluídas) e Cloudflare `search`, sem escrita nos bancos.
- Observabilidade da nova versão confirmou eventos `mcp_response_stream` com `phase:finished`, `transport:json` e sem gravar o corpo. A confirmação de leitura dos bytes **não** é garantia de aceitação pelo ChatGPT.
- **Aceite parcial de confiabilidade:** a correção de observabilidade e os testes estão aprovados; a origem da intermitência externa não foi reproduzida de modo conclusivo. Não declarar resolução definitiva sem observação contínua sob uso real.
- **Pendência manual:** rotacionar, pelo painel seguro da aplicação OAuth e pelo Worker, o client secret do GitHub anteriormente exposto, caso ainda não tenha sido rotacionado; não copiar seu valor em conversas.
