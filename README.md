# Assistente MCPs

Servidor MCP em Cloudflare Workers, escrito em JavaScript (ES Modules), que conecta clientes MCP aos servidores oficiais do GitHub e da Cloudflare com OAuth.

Cliente MCP → Assistente MCPs (Worker Cloudflare) → MCPs oficiais GitHub e Cloudflare.

## Escopo

Este repositório mantém **somente MCPs**, autenticação, infraestrutura e testes. Skills, especialistas, plugin ChatGPT e empacotamento de plugin não fazem parte deste projeto. O histórico anterior permanece acessível nos commits do GitHub.

## Componentes

- `mcps/github/` e `mcps/cloudflare/`: integrações dos provedores.
- `server/`: Worker, OAuth, cliente remoto, catálogo e encaminhamento de ferramentas MCP.
- `tests/`: verificações de segurança, autenticação, protocolo e execução.
- `docs/`: documentação de arquitetura, operação e histórico técnico.

## Desenvolvimento e verificação

```sh
npm ci
npm run check
npm run test:browser
npm run test:runtime
```

Para testes de navegador no CI, o Chromium é instalado antes da execução. Publicação em produção somente após verificação e promoção controlada.

Endpoint de produção: https://assistente.joaolds.xyz.br/mcp

Veja [arquitetura](docs/ARQUITETURA.md), [ferramentas MCP](docs/MCPS.md) e [OAuth upstream](docs/OAUTH-UPSTREAM.md).
