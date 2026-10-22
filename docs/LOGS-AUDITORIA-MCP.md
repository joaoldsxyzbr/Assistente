# Diagnóstico de ferramentas MCP

O Assistente registra um evento estruturado `tool_execution` por execução, ligado ao `mcp_request` e `mcp_response_stream` pelo mesmo `traceId`.

Campos: `tool`, `server`, `traceId`, `write`, `stage`, `durationMs`, `outcome`, `category` (erros) e `uncertain`.

Etapas: `validation`, `oauth`, `connection`, `upstream`, `normalization` e `preview`.

As chamadas diretas conhecem as etapas detalhadas; ferramentas especiais antigas usam uma classificação conservadora. Em erros de escrita com efeito incerto, consultar o provedor antes de repetir.

Não registrar SQL, parâmetros, tokens, credenciais, conteúdo, nomes de arquivos, mensagens de erro ou respostas.

## Como consultar

Cloudflare Dashboard > Workers & Pages > assistente > Observability > Logs. Filtre `tool_execution`, ferramenta e `traceId`. Compare eventos `mcp_request` e `mcp_response_stream`. HTTP 200 e stream concluído não garantem entrega ao ChatGPT.

A retenção é da Cloudflare Workers Logs; não há banco ou sistema de monitoramento adicional.

## Validação e publicação

Testes Node: sucesso, isError, `success:false`, OAuth, timeout, prévia e privacidade. CI inclui navegador e Workerd. Merge na main não faz deploy do Worker; validar versão promovida antes de assumir que os logs já estão ativos.
