# Arquitetura do Assistente

## Objetivo

Este repositório implementa o hub MCP do plugin Assistente Geral. O plugin mantém skills e regras conversacionais; o Worker `assistente` autentica o ChatGPT, publica uma allowlist de ferramentas e encaminha cada chamada ao MCP de destino.

A regra estrutural é simples: **um Worker, um endpoint MCP e um módulo local por integração**.

## Responsabilidades

| Camada | Responsabilidade |
|---|---|
| Assistente Geral | Skills, regras de domínio, interpretação da intenção e apresentação dos resultados |
| Worker `assistente` | OAuth, catálogo allowlist, escopos e roteamento MCP |
| `src/mcps/<nome>/` | Contratos das ferramentas aprovadas de cada integração |
| MCP de destino | Execução técnica e aplicação das permissões do token de serviço |

Ponto e Gastos ficam fora deste repositório. Nenhum Worker daqui acessa ou altera seus bancos.

## Fluxo MCP

O catálogo local é a fonte de verdade das ferramentas publicadas. O Worker não descobre nem publica ferramentas remotas dinamicamente.

Para cada chamada:
1. o token OAuth do ChatGPT é validado;
2. o Worker verifica o escopo necessário;
3. abre uma conexão com o MCP remoto;
4. executa uma vez;
5. fecha a conexão.

Operações que podem escrever não recebem retry automático. Se a chamada já começou e falha, o resultado é tratado como potencialmente incerto.

## Autenticação e autorização

| Origem → destino | Credencial | Regra |
|---|---|---|
| ChatGPT → Worker | OAuth 2.1 + PKCE | `mcp:read` é básico; `mcp:write` é exigido para escrita |
| Navegador → autorização | `ASSISTENTE_OAUTH_PASSWORD` | senha conferida antes de concluir a autorização |
| Worker → Cloudflare MCP | `MCP_CLOUDFLARE_TOKEN` | bearer separado do OAuth do ChatGPT |
| Cloudflare MCP → API Cloudflare | API Token Cloudflare | permissões do token limitam os recursos acessíveis |

O token do ChatGPT nunca é encaminhado ao MCP remoto.

### Fluxo de autorização

No `GET /authorize`, o Worker valida a requisição OAuth e renderiza a tela de autorização.

No `POST /authorize`, a senha é conferida e a mesma requisição OAuth é validada novamente antes de `completeAuthorization` emitir o código. O formulário não cria cookie, handle ou transação própria de consentimento.

A página mantém CSP mínima: `default-src 'none'`, `base-uri 'none'` e `frame-ancestors 'none'`. Não usa `form-action`, pois essa diretiva bloquearia a cadeia de redirect até o callback do ChatGPT.

O `OAUTH_KV` guarda o estado exigido pela biblioteca OAuth. Marcadores `diagnostic:oauth:*` continuam temporariamente ativos até a confirmação do primeiro fluxo E2E pós-correção de CSP; eles armazenam somente etapa, horário, status e código OAuth seguro.

## Segurança

- endpoints MCP remotos precisam ser HTTPS e não podem conter credenciais, query string ou fragmento;
- a allowlist local impede exposição automática de ferramentas remotas;
- secrets não entram no Git nem em respostas de status;
- erros remotos não revelam endpoint, token ou exceção interna;
- query strings são redigidas na observabilidade;
- invocation logs permanecem desativados;
- não há binding D1 neste Worker.

## Configuração e deploy

`wrangler.assistente.jsonc` é a fonte declarativa do Worker:
- `assistente.joaolds.xyz.br` como custom domain;
- `workers.dev` e previews desativados;
- binding `OAUTH_KV`;
- endpoint do Cloudflare MCP.

`npm run build:workers` faz build dry-run. O pipeline conectado ao Cloudflare usa `wrangler versions upload`; promoção de versão é uma etapa separada.

## Organização

| Caminho | Responsabilidade |
|---|---|
| `src/host/config.ts` | valida a configuração dos MCPs |
| `src/host/remote-client.ts` | cliente MCP remoto |
| `src/host/worker.ts` | Worker real: servidor MCP, roteamento e catálogo |
| `src/mcps/` | contratos allowlist por integração |
| `src/shared/oauth-authorization.ts` | página e fluxo HTTP de autorização |
| `src/shared/oauth-mcp-worker.ts` | OAuthProvider, escopos e proteção do endpoint MCP |
| `tests/` | testes das regras puras e contratos |

Não existe segunda implementação de host. Novas abstrações só entram quando houver necessidade concreta.
