# Arquitetura do Assistente

## Objetivo

Este repositório implementa o hub MCP do plugin Assistente Geral. O plugin mantém skills e regras conversacionais; o Worker `assistente` autentica o ChatGPT, publica uma allowlist de ferramentas e encaminha cada chamada ao MCP de destino.

A regra estrutural é simples: **um Worker, um endpoint MCP e um módulo local por integração ou domínio**.

## Responsabilidades

| Camada | Responsabilidade |
|---|---|
| Assistente Geral | Skills, regras de domínio, interpretação da intenção e apresentação dos resultados |
| Worker `assistente` | OAuth, catálogo allowlist, escopos, ferramentas locais e roteamento MCP |
| `src/mcps/<nome>/` | Contratos e lógica fixa das ferramentas aprovadas |
| MCP de destino | Execução técnica e aplicação das permissões do token de serviço |

O controle de ponto possui três ferramentas locais no hub, mas **não acessa D1 diretamente**. Elas compõem chamadas fixas ao Cloudflare MCP, que então usa a API Cloudflare para consultar ou escrever no D1. Gastos continua fora deste repositório.

## Fluxo MCP

O catálogo local é a fonte de verdade das ferramentas publicadas. O Worker não descobre nem publica ferramentas remotas dinamicamente.

Cada ferramenta declara seu contrato OAuth no descriptor MCP: leitura usa `mcp:read`; ferramentas classificadas como escrita usam `mcp:read` + `mcp:write`. Isso permite ao ChatGPT fazer reautorização de escopo (*step-up*) sem pedir permissões fora do contrato da ferramenta.

Para ferramentas remotas genéricas:
1. o token OAuth do ChatGPT é validado;
2. o Worker verifica o escopo necessário;
3. abre uma conexão com o MCP remoto;
4. executa uma vez;
5. fecha a conexão.

Para ponto:
1. `ponto_registrar`, `ponto_hoje` ou `ponto_resumo` recebe somente os dados mínimos do comando;
2. o Worker resolve a data atual em `America/Sao_Paulo` quando necessário;
3. monta código fixo para `mcp_cloudflare__execute`;
4. o Cloudflare MCP chama o endpoint D1 da API Cloudflare;
5. o resultado pequeno e estruturado volta ao ChatGPT.

`ponto_registrar` usa escrita atômica no D1: segunda a sexta preenche `entrada → ida_intervalo → volta_intervalo → saida`; sábado preenche somente `entrada → saida`. `ponto_hoje` consulta a view `banco_horas`; `ponto_resumo` consulta a view `resumo`.

### Contrato com o Assistente Geral

Na versão 1.5.10 do plugin, o roteamento rotineiro de ponto ficou explícito e direto:
- `ponto HHMM` ou `ponto HH:MM` → `ponto_registrar`;
- `ponto hoje` → `ponto_hoje`;
- `ponto resumo` → `ponto_resumo`.

Esses três pedidos não usam planilha, memória nem o executor genérico antes da ferramenta dedicada. Em resultado incerto de escrita, a skill reconcilia com `ponto_hoje` e não repete `ponto_registrar` cegamente. Correções, exclusões e consultas de datas específicas continuam podendo usar `mcp_cloudflare__execute`, mas somente através do Assistente MCPs e sempre contra o D1 canônico de ponto.

Gastos continua sem ferramentas dedicadas no hub. A skill financeira usa o D1 canônico somente através do Assistente MCPs e, enquanto não houver ferramentas próprias, usa `mcp_cloudflare__execute` do hub sem recorrer a um app Cloudflare separado.

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
- ferramentas de ponto usam SQL e endpoint fixos gerados no código do hub, sem aceitar SQL livre do ChatGPT;
- secrets não entram no Git nem em respostas de status;
- erros remotos não revelam endpoint, token ou exceção interna;
- query strings são redigidas na observabilidade;
- invocation logs permanecem desativados;
- **não há binding D1 neste Worker**.

## Configuração e deploy

`wrangler.assistente.jsonc` é a fonte declarativa do Worker:
- `assistente.joaolds.xyz.br` como custom domain;
- `workers.dev` e previews desativados;
- binding `OAUTH_KV`;
- endpoint do Cloudflare MCP;
- conta Cloudflare padrão injetada automaticamente no `execute` quando a chamada não informa `account_id`;
- `PONTO_D1_DATABASE_ID` identifica o D1 de ponto usado pelas chamadas via Cloudflare MCP.

`npm run build:workers` faz build dry-run. O pipeline conectado ao Cloudflare usa `wrangler versions upload`; promoção de versão é uma etapa separada.

## Organização

| Caminho | Responsabilidade |
|---|---|
| `src/host/config.ts` | valida a configuração dos MCPs |
| `src/host/remote-client.ts` | cliente MCP remoto |
| `src/host/worker.ts` | Worker real: servidor MCP, roteamento e catálogo |
| `src/mcps/cloudflare/` | contratos da integração Cloudflare |
| `src/mcps/ponto/` | ferramentas dedicadas de ponto que usam Cloudflare MCP |
| `src/shared/oauth-authorization.ts` | página e fluxo HTTP de autorização |
| `src/shared/oauth-mcp-worker.ts` | OAuthProvider, escopos e proteção do endpoint MCP |
| `tests/` | testes das regras puras e contratos |

Não existe segunda implementação de host. Novas abstrações só entram quando houver necessidade concreta.
