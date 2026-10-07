# Assistente

O **Assistente** é o hub MCP do plugin **Assistente Geral**. O plugin cuida das skills e regras de conversa; este repositório mantém um único Worker que autentica o ChatGPT e encaminha somente as ferramentas MCP declaradas localmente.

## Arquitetura

- **1 Worker:** `assistente`.
- **1 endpoint MCP:** `https://assistente.joaolds.xyz.br/mcp`.
- **1 módulo por MCP/domínio:** `src/mcps/<nome>`.
- **Allowlist local:** configurar um MCP não publica ferramentas automaticamente.
- **Assistente Geral:** usa o app **Assistente MCPs** como sua conexão MCP; não depende diretamente do app Cloudflare.
- **Cloudflare MCP:** integração genérica atrás do hub, com `docs`, `search` e `execute`.
- **Controle de ponto:** ferramentas locais `ponto_registrar`, `ponto_hoje` e `ponto_resumo` usam somente o Cloudflare MCP para consultar/escrever no D1; o Worker não possui binding D1.
- **Controle de gastos:** continua fora deste repositório e sob as regras do plugin Assistente Geral.

Detalhes e decisões duráveis ficam em [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Trabalho pendente fica em Issues.

## Autenticação

ChatGPT → Worker usa OAuth 2.1 com authorization code, PKCE, descoberta e Client ID Metadata Documents. A autorização exige a senha do proprietário em `ASSISTENTE_OAUTH_PASSWORD`.

O Worker publica:
- `mcp:read` para chamadas básicas e consultas de ponto;
- `mcp:write` para `mcp_cloudflare__execute` e `ponto_registrar`;
- `offline_access` para renovação da conexão.

Worker → Cloudflare MCP usa um token separado em `MCP_CLOUDFLARE_TOKEN`. O token Cloudflare nunca autentica o ChatGPT.

## Configuração de produção

A configuração declarativa está em `wrangler.assistente.jsonc`:

- custom domain: `assistente.joaolds.xyz.br`;
- `workers.dev` e previews desativados;
- KV OAuth: `OAUTH_KV`;
- endpoint remoto: `https://mcp.cloudflare.com/mcp`;
- conta Cloudflare padrão: `MCP_CLOUDFLARE_ACCOUNT_ID`, usada automaticamente pelo `execute`;
- banco canônico do ponto: `PONTO_D1_DATABASE_ID`, usado apenas para montar chamadas fixas ao Cloudflare MCP.

Secrets necessários, configurados fora do Git:
- `ASSISTENTE_OAUTH_PASSWORD`;
- `MCP_CLOUDFLARE_TOKEN`.

No ChatGPT, use:

    https://assistente.joaolds.xyz.br/mcp

com autenticação OAuth.

## Desenvolvimento

Requisitos:
- Node.js 24 ou superior;
- npm.

Instale e valide:

    npm ci
    npm run check

`npm run check` executa typecheck, testes e build dry-run do Worker.

## Entrega

O GitHub é a fonte de verdade. O build conectado ao Cloudflare usa:

    npx wrangler versions upload --config wrangler.assistente.jsonc

Isso cria uma versão sem trocar o tráfego automaticamente. Depois do CI verde e da validação necessária, a versão é promovida para produção.
