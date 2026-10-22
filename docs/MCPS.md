# MCPs e ferramentas próprias do Assistente

O ChatGPT vê somente ferramentas próprias. OAuth e servidores MCP oficiais GitHub e Cloudflare permanecem internos no Worker.

## GitHub

Dez atalhos próprios para arquivos, código, branches, commits, PRs e CI, além de `github_edit_file` e `github_relocate_directory`. Não publicamos os comandos genéricos `mcp_github_tools` ou `mcp_github_call`.

## Cloudflare

Ferramentas próprias de leitura: `cloudflare_contas`, `cloudflare_workers`, `cloudflare_bancos_d1` e `cloudflare_documentacao`. Usam o MCP oficial internamente e não expõem entrada arbitrária de JavaScript ou SQL.

Atenção: modificações em D1, Workers e outros recursos Cloudflare ainda precisam de ferramentas próprias, antes de serem acessíveis pelo Assistente.

## Segurança e publicação

OAuth com tokens protegidos em KV e escopos separados `mcp:read`/`mcp:write` permanecem. Validar CI e runtime e publicar o Worker separadamente; merge no GitHub não faz deploy.
