# Assistente MCPs

Um **Worker MCP** enxuto hospedado na Cloudflare que disponibiliza somente **skills**. GitHub e Cloudflare usam os **MCPs oficiais conectados diretamente ao ChatGPT via OAuth**. O Worker não atua como proxy nem guarda tokens dos fornecedores.

## Estrutura

| Diretório | Responsabilidade |
| --- | --- |
| `server/` | Servidor MCP de skills e OAuth do próprio Worker |
| `skills/` | Ponto, gastos e desenvolvimento (instruções, sem dados pessoais) |
| `docs/` | Arquitetura e integração com os MCPs oficiais |
| `tests/` | Validação de segurança, OAuth e catálogo |
| `.github/` | CI |
| `wrangler.assistente.jsonc` | Publicação do Worker e KV OAuth |

## Conexões

1. **Assistente MCPs**: `https://assistente.joaolds.xyz.br/mcp`. Disponibiliza `assistente_skill` e `assistente_status`.
2. **GitHub oficial**: conectar ao ChatGPT e autorizar OAuth. Execute ferramentas do GitHub diretamente, não pelo Assistente.
3. **Cloudflare oficial**: conectar ao ChatGPT e autorizar OAuth. Acesso aos D1 de ponto e gastos é feito diretamente por ferramentas oficiais.

A skill **não é uma ferramenta de gravação**. Para registrar ponto ou lançar gastos, consulte a skill e faça a operação com o MCP oficial Cloudflare. IDs de bancos não concedem autorização. O cliente ChatGPT precisa disponibilizar as três conexões no contexto para o fluxo integrado.

**Autenticação:** não há `MCP_GITHUB_TOKEN` ou `MCP_CLOUDFLARE_TOKEN` no Worker. O OAuth próprio do Assistente ainda usa `ASSISTENTE_OAUTH_PASSWORD` e `OAUTH_KV`; eliminar também essa senha exige outro provedor de identidade. Não confunda autenticação do Assistente com OAuth dos provedores.

## Desenvolvimento

JavaScript nativo, SDKs oficiais de MCP/OAuth e Cloudflare Workers.

```sh
npm ci
npm run check
```

CI e upload de versão não significam promoção para produção. Consulte [arquitetura](docs/ARQUITETURA.md) e [migração](docs/MIGRACAO-OAUTH-OFICIAL.md).
