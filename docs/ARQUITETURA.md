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

Cada ferramenta declara seu contrato OAuth no descriptor MCP: leitura usa `mcp:read`; ferramentas classificadas como escrita usam `mcp:read` + `mcp:write`. Isso permite ao ChatGPT fazer reautorização de escopo (*step-up*) sem pedir permissões fora do contrato da ferramenta.

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
| Worker → Cloudflare MCP | `MCP_CLOUDFLARE_TOKEN` | bearer separado do OAuth do ChatGPT; `MCP_CLOUDFLARE_ACCOUNT_ID` seleciona a conta padrão |
| Cloudflare MCP → API Cloudflare | API Token Cloudflare | permissões do token limitam os recursos acessíveis |

O token do ChatGPT nunca é encaminhado ao MCP remoto.

### Fluxo de autorização

No `GET /authorize`, o Worker valida a requisição OAuth e renderiza a tela de autorização.

No `POST /authorize`, a senha é conferida e a mesma requisição OAuth é validada novamente antes de `completeAuthorization` emitir o código. O formulário não cria cookie, handle ou transação própria de consentimento.

A página mantém CSP mínima: `default-src 'none'`, `base-uri 'none'` e `frame-ancestors 'none'`. Não usa `form-action`, pois essa diretiva bloquearia a cadeia de redirect até o callback do ChatGPT.

O `OAUTH_KV` guarda o estado exigido pela biblioteca OAuth. Marcadores `diagnostic:oauth:*` mantêm por 1 hora o último estado seguro das fronteiras OAuth.

### Auditoria

O Worker mantém logs estruturados permanentes na observabilidade da Cloudflare para permitir auditoria e depuração sem expor conteúdo sensível.

Os eventos registram apenas metadados operacionais: etapa, status, resultado, servidor, ferramenta, classificação leitura/escrita, resultado incerto e scopes exigidos. Não entram nos logs senha, bearer token, authorization code, query string OAuth, argumentos de ferramenta, código executado nem conteúdo de banco.

Eventos principais:
- autorização OAuth concluída, negada ou rejeitada;
- requisição/resposta do endpoint de token;
- falha de autenticação ou escopo MCP;
- resultado da requisição MCP;
- resultado de chamada ao MCP remoto, incluindo escrita potencialmente incerta.

A configuração continua com `redact_query_string: true`, `invocation_logs: false` e persistência dos logs explícitos do Assistente.

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
- endpoint do Cloudflare MCP;
- conta Cloudflare padrão injetada automaticamente no `execute` quando a chamada não informa `account_id`.

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
