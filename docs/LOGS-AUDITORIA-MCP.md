# Diagnóstico e auditoria das ferramentas MCP

Todas as 25 ferramentas geram exatamente um evento `tool_execution` por execução. O identificador `traceId` liga a ferramenta aos eventos HTTP `mcp_request` e `mcp_response_stream`.

Campos: `tool`, `server`, `traceId`, `write`, `stage`, `durationMs`, `outcome`, `category` (em falhas) e `uncertain`.

As etapas são `validation`, `oauth`, `connection`, `upstream`, `normalization` e `preview`. Para chamadas GitHub/Cloudflare via MCP oficial, as etapas são marcadas durante a execução. Para as ferramentas GitHub de edição exata e realocação, a mutação é sinalizada explicitamente somente antes da primeira escrita na API GitHub.

`uncertain:true` significa que uma operação de escrita foi tentada e o resultado não é confirmado. **Não repetir automaticamente**: consultar o estado remoto. Erros de validação, OAuth, conexão inicial e prévias não são considerados tentativas de escrita.

Se a API Cloudflare devolver `success:false` dentro de uma resposta MCP válida, a ferramenta também retorna `isError:true` ao cliente; o conteúdo da resposta não é copiado para o log.

## Privacidade

O log é restrito a metadados padronizados. Não contém SQL, argumentos, caminhos de arquivos, conteúdo, tokens, credenciais, respostas MCP, emails nem mensagens remotas. A Cloudflare persiste os logs conforme a retenção contratada; não há novo banco ou serviço.

## Investigação

No Cloudflare Dashboard, acesse **Workers & Pages → assistente → Observability → Logs**. Pesquise `tool_execution`, a ferramenta e o `traceId`. Correlacione com `mcp_request` e `mcp_response_stream`. HTTP 200 e stream concluído não garantem que o ChatGPT recebeu ou interpretou a resposta.

## Validação

O CI executa testes Node, navegador, Workerd e build Wrangler. Os testes verificam prévias sem mutação, início da primeira escrita, resposta da Cloudflare com erro interno, autenticação e ausência de dados sensíveis. Testes de escrita usam API GitHub simulada, sem modificar dados de produção.
