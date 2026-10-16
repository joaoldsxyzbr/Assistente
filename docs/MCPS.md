# Conexões MCP oficiais

O Assistente é um Worker MCP hospedado na Cloudflare que disponibiliza apenas as skills `ponto`, `gastos` e `desenvolvimento` por `assistente_skill`.

- **Assistente MCPs**: `https://assistente.joaolds.xyz.br/mcp` — OAuth próprio, armazenamento `OAUTH_KV` e senha `ASSISTENTE_OAUTH_PASSWORD`; publica só `assistente_status` e `assistente_skill`.
- **GitHub oficial**: conexão direta no ChatGPT por OAuth; executar operações de GitHub nele, não pelo Worker.
- **Cloudflare oficial**: conexão direta no ChatGPT por OAuth; executar consultas e escritas D1 nele, não pelo Worker.

A autenticação de cada MCP é independente. O OAuth do Assistente não fornece acesso delegado aos MCPs oficiais. Não precisa configurar `MCP_GITHUB_TOKEN` nem `MCP_CLOUDFLARE_TOKEN` no novo Worker, embora possam existir em versões antigas da produção até sua limpeza operacional.

## Teste seguro

1. Autorize as três conexões no ChatGPT.
2. Peça `assistente_status` e `assistente_skill` para ponto e gastos.
3. Consulte ponto e gastos em modo somente leitura pelo Cloudflare oficial e confira os IDs D1 antes de operar.
4. Faça escrita somente quando houver um lançamento real solicitado. Conciliar antes de repetir timeout.
5. Confira o build GitHub e Cloudflare; `versions upload` não promove produção.

Arquivos Markdown no Worker são enviados por ferramenta de leitura e não geram chamadas automaticamente. A conexão do ChatGPT deve disponibilizar os MCPs oficiais ao lado do Assistente.
