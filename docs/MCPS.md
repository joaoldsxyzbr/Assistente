# MCPs e recursos do Assistente

## Arquitetura

O Worker Assistente MCPs, em **JavaScript puro (ES Modules)**, encaminha as chamadas aos MCPs oficiais GitHub e Cloudflare, preservando as ferramentas oficiais.

- `mcp_github_tools` e `mcp_github_call`: descoberta e execução das ferramentas MCP oficiais do GitHub.
- `mcp_cloudflare_tools` e `mcp_cloudflare_call`: descoberta e execução das ferramentas MCP oficiais da Cloudflare.
- `github_relocate_directory`: operação específica para **cópia/movimentação de diretórios**, via API Git Database oficial com o mesmo token OAuth GitHub; não envia conteúdo dos arquivos pelo ChatGPT.
- `assistente_status`: estado das conexões upstream e links seguros para conectar/desconectar provedores.

O Worker não tem binding D1 nem ferramentas D1 próprias; acessos a D1, quando necessários, usam o MCP oficial Cloudflare.

## OAuth e privacidade

São dois trechos OAuth: ChatGPT → Worker e Worker → GitHub/Cloudflare. O Worker guarda tokens dos provedores cifrados no KV. `github_relocate_directory` reutiliza o token GitHub e não exige credencial, serviço ou permissão nova. Não registrar tokens, caminhos de arquivos ou conteúdo nos logs.

## Operações GitHub confiáveis

Para mudanças de conteúdo, o `push_files` oficial continua com limite preventivo de 8 arquivos/128 KiB por chamada e timeout seletivo. Conferir o estado após erros incertos, sem repetição automática.

Para reorganizações, usar `github_relocate_directory`: prévia obrigatória, `expectedHeadSha`, cópia/movimentação em um commit, sem `force` e sem sobrescrever arquivos distintos. Branch `main` e `master` são protegidas contra escrita nessa ferramenta. Alterar imports separadamente e executar CI antes do merge.

Veja [docs/RELOCACAO-GITHUB-2026-10-19.md](RELOCACAO-GITHUB-2026-10-19.md) e [docs/LOTES-2026-10-19.md](LOTES-2026-10-19.md).

## Produção

Há um único Worker de produção; **não existe Preview mantido**. CI Node/Chromium/Workerd e build dry-run são obrigatórios antes da promoção explícita de versão. Verificar os bindings, realizar testes de leitura e manter a versão anterior para rollback. Nenhum teste deve gravar nos bancos D1 reais.
