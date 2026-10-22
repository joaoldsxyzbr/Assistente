# Estado atual — Assistente MCPs (22/10/2026)

## Arquitetura

O repositório `joaoldsxyzbr/Assistente` mantém somente o Worker MCP, integrações oficiais e testes. O ChatGPT vê **apenas nossas próprias ferramentas**; os MCPs oficiais GitHub e Cloudflare e seu OAuth operam exclusivamente no backend. Um Worker serve `https://assistente.joaolds.xyz.br/mcp`.

O código está organizado em `mcps/github/` (ferramentas, OAuth e testes), `mcps/cloudflare/` (idem) e `server/` (transporte e infraestrutura comum). JavaScript ES Modules e SDKs oficiais; sem novas dependências e sem skills.

## Catálogo de ferramentas

São 25 ferramentas públicas: 1 de status, 15 do GitHub e 9 da Cloudflare.

- GitHub: 10 atalhos de arquivos, branches, commits, PRs e CI, mais edição exata de arquivo, realocação de diretório, commit de múltiplos arquivos, merge de PR por SHA e exclusão de arquivo em branch protegida por validação.
- Cloudflare: contas, Workers, bancos D1, documentação; SELECT e alterações D1 parametrizadas com confirmação; listagem de versões e deploys de Worker, e publicação de versão existente com confirmação.
- Genéricas removidas da interface: `mcp_github_tools`, `mcp_github_call`, `mcp_cloudflare_tools`, `mcp_cloudflare_call`. Execução remota oficial continua por funções internas tipadas.

Todas as escritas requerem `mcp:write`; leituras usam `mcp:read`. Chamadas com efeito incerto nunca devem ser repetidas automaticamente. Para operações fora do catálogo, implementar ferramenta própria no módulo do provedor.

## Publicação

O merge na `main` não implica deploy Cloudflare. Validar `npm run check`, `npm run test:browser` e `npm run test:runtime` no CI antes do merge. Após deploy independente, atualizar a conexão do ChatGPT e validar as leituras oficiais e OAuth.

Nenhum teste automatizado deve gravar em D1 real. O Worker de produção não tem binding D1 direto; operações passam pelo MCP oficial Cloudflare.
