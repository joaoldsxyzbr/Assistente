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

O controle de ponto possui três ferramentas locais no hub, mas **não acessa D1 diretamente**. Elas compõem chamadas fixas ao Cloudflare MCP, que então usa a API Cloudflare para consultar ou escrever no D1. Gastos utiliza cinco ferramentas locais em `src/mcps/gastos/`, encaminhadas exclusivamente ao Cloudflare MCP e ao D1 canônico, sem acesso direto do Worker ao D1.

O **GitHub MCP** também é um destino remoto oficial, separado do Cloudflare, com autenticação própria por PAT. Sua allowlist cobre operações usuais de repositórios, commits, arquivos, issues, PRs e Actions, sem fixar `owner` ou `repo`. A capacidade de acessar um repositório depende do token GitHub e da autorização da tarefa.

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

Gastos dispõe de `gastos_resumo`, `gastos_listar`, `gastos_registrar`, `gastos_atualizar` e `gastos_excluir`. A skill financeira usa essas operações dedicadas para o fluxo comum. Todas chamam o D1 canônico via Assistente MCPs → Cloudflare MCP; o executor genérico fica restrito a exceções autorizadas. O período padrão é o próximo mês em `America/Sao_Paulo`.

Operações que podem escrever não recebem retry automático. Se a chamada já começou e falha, o resultado é tratado como potencialmente incerto.


### Integração GitHub

O Worker usa o **mesmo cliente MCP remoto**, passando `Authorization: Bearer <MCP_GITHUB_TOKEN>` somente ao GitHub e `X-MCP-Toolsets: context,repos,issues,pull_requests,actions`. O tráfego GitHub não passa pelo Cloudflare MCP. O endpoint GitHub não recebe o token Cloudflare nem o token OAuth do usuário.

As ferramentas são declaradas localmente em `src/mcps/github/tools.ts` (não são descobertas automaticamente). Nomes publicados recebem prefixo `mcp_github__`; leitura exige `mcp:read` e escrita exige também `mcp:write`. A conexão só é publicada quando URL e secret estão configurados. Nenhuma ferramenta aceita token, endpoint arbitrário ou SQL em seus parâmetros.

O GitHub MCP **não tem filtro hardcoded por repositório**. Os parâmetros `owner` e `repo` são fornecidos no pedido, e os direitos efetivos são os da credencial GitHub. A regra de trabalhar exclusivamente no repositório `joaoldsxyzbr/Assistente` aplica-se a este projeto, não ao MCP multi-projetos.

Para conectar, crie PAT com escopo por repositórios conforme sua necessidade e permissões mínimas para as operações que efetivamente serão feitas; armazene-o somente como **secret `MCP_GITHUB_TOKEN`** do Worker. Testar primeiro com `mcp_github__get_me`, sem operações de escrita. Consulte [documentação oficial GitHub MCP](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md).

## Autenticação e autorização

| Origem → destino | Credencial | Regra |
|---|---|---|
| ChatGPT → Worker | OAuth 2.1 + PKCE | `mcp:read` é básico; `mcp:write` é exigido para escrita |
| Navegador → autorização | `ASSISTENTE_OAUTH_PASSWORD` | senha conferida antes de concluir a autorização |
| Worker → Cloudflare MCP | `MCP_CLOUDFLARE_TOKEN` | bearer separado do OAuth do ChatGPT; `MCP_CLOUDFLARE_ACCOUNT_ID` seleciona a conta padrão |
| Worker → GitHub MCP oficial | `MCP_GITHUB_TOKEN` | PAT separado, com permissões do GitHub para os repositórios escolhidos; sem owner/repo fixado pelo Worker |
| Cloudflare MCP → API Cloudflare | API Token Cloudflare | permissões do token limitam os recursos acessíveis |

O token do ChatGPT nunca é encaminhado ao MCP remoto.

### Fluxo de autorização

No `GET /authorize`, o Worker valida a requisição OAuth e renderiza a tela de autorização.

No `POST /authorize`, a senha é conferida e a mesma requisição OAuth é validada novamente antes de `completeAuthorization` emitir o código. O formulário não cria cookie, handle ou transação própria de consentimento.

A página mantém CSP mínima: `default-src 'none'`, `base-uri 'none'` e `frame-ancestors 'none'`. Não usa `form-action`, pois essa diretiva bloquearia a cadeia de redirect até o callback do ChatGPT.

O `OAUTH_KV` guarda exclusivamente o estado exigido pela biblioteca OAuth. O rastreamento provisório de fronteiras com marcadores `diagnostic:oauth:*` foi retirado do caminho de requisição após validação do MCP em produção; a observabilidade permanente continua nos logs estruturados.

### Auditoria

O Worker mantém logs estruturados permanentes na observabilidade da Cloudflare para permitir auditoria e depuração sem expor conteúdo sensível.

Os eventos registram apenas metadados operacionais: etapa, status, resultado, servidor, ferramenta, classificação leitura/escrita, resultado incerto e scopes exigidos. Não entram nos logs senha, bearer token, authorization code, query string OAuth, argumentos de ferramenta, código executado nem conteúdo de banco.

Eventos principais:
- autorização OAuth concluída, negada ou rejeitada;
- falhas de token/OAuth reportadas pelo provider, sem persistir o corpo da resposta;
- falha de autenticação ou escopo MCP;
- resultado da requisição MCP;
- resultado de chamada ao MCP remoto, incluindo escrita potencialmente incerta.

A configuração continua com `redact_query_string: true`, `invocation_logs: false` e persistência dos logs explícitos do Assistente.

## Segurança

- endpoints MCP remotos precisam coincidir com os endpoints HTTPS oficiais Cloudflare e GitHub; não podem conter credenciais, query string ou fragmento;
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
- `PONTO_D1_DATABASE_ID` identifica o D1 de ponto usado pelas chamadas via Cloudflare MCP;
- `MCP_GITHUB_URL` aponta para `https://api.githubcopilot.com/mcp/`; o token `MCP_GITHUB_TOKEN` é sempre secret independente.

`npm run build:workers` faz build dry-run. O pipeline conectado ao Cloudflare usa `wrangler versions upload`; promoção de versão é uma etapa separada.

## Organização

| Caminho | Responsabilidade |
|---|---|
| `src/host/config.ts` | valida a configuração dos MCPs |
| `src/host/remote-client.ts` | cliente MCP remoto |
| `src/host/worker.ts` | Worker real: servidor MCP, roteamento e catálogo |
| `src/mcps/cloudflare/` | contratos da integração Cloudflare |
| `src/mcps/github/` | allowlist de ferramentas da integração GitHub oficial |
| `src/mcps/ponto/` | ferramentas dedicadas de ponto que usam Cloudflare MCP |
| `src/mcps/gastos/` | cinco ferramentas de gastos que usam Cloudflare MCP |
| `src/shared/oauth-authorization.ts` | página e fluxo HTTP de autorização |
| `src/shared/oauth-mcp-worker.ts` | OAuthProvider, escopos e proteção do endpoint MCP |
| `tests/` | testes das regras puras e contratos |

Não existe segunda implementação de host. Novas abstrações só entram quando houver necessidade concreta.

## Auditoria de confiabilidade (outubro de 2026)

Foi confirmado em produção o acesso de leitura aos MCPs GitHub e Cloudflare e conferido o schema canônico D1 de ponto. A rodada posterior à auditoria adiciona testes SQLite em memória para o registro de ponto e fixa o destino HTTPS dos tokens do GitHub e Cloudflare. Diagnósticos antigos de OAuth não são mais gravados no KV durante o atendimento normal; logs estruturados permanecem.

O CI de PR continua validando typecheck, testes unitários/de banco sintético e build dry-run, **não substitui** o teste de OAuth fresco e smoke de escritas MCP em ambiente descartável. A proteção de `main` não foi alterada por exclusão explícita do usuário. Dependabot cuida de avisos semanais de atualização de npm sem ampliar o CI normal.

### Gastos — cinco ferramentas dedicadas

O Worker expõe `gastos_resumo` e `gastos_listar` (somente leitura), além de `gastos_registrar`, `gastos_atualizar` e `gastos_excluir` (escopo de escrita). A configuração `GASTOS_D1_DATABASE_ID` aponta para o D1 já usado pelo controle financeiro. O fluxo é `@Assistente Geral → Assistente MCPs → Cloudflare MCP → D1`, sem binding direto do D1 e sem banco paralelo.

Sem período explícito, todas as ferramentas usam o **mês seguinte** (timezone America/Sao_Paulo). Os identificadores `movimentacoes_MM_AAAA` são validados e nunca aceitos como SQL livre. A coluna `valor` continua TEXT: o parse estrito converte para centavos inteiros; valores inválidos tornam os totais não confirmáveis. Leituras não criam tabelas; o primeiro registro autorizado de mês novo utiliza esquema verificado da referência persistida, sem copiar registros. Operações por descrição retornam candidatos se ambíguas, e atualizações/exclusões usam condições de estado antigo e `RETURNING` para impedir perda silenciosa de mudanças. Escritas incertas não são repetidas automaticamente. Dado de teste é sintético e não acessa o D1 real.

## Recuperação de falhas de MCP

O cliente remoto estabelece até 15 segundos para handshake e até 45 segundos para a chamada. Erros de timeout de leitura podem ser repetidos. Quando uma chamada de escrita já começou, qualquer falha de rede, timeout ou rejeição sem retorno confiável é marcada como resultado incerto e **não recebe retry automático**. A resposta solicita verificar o recurso de origem antes de outra tentativa. Logs registram metadados do resultado, não a exceção bruta.

## Controle do PC (primeira versão)

O módulo opcional src/mcps/pc/ declara ferramentas especializadas protegidas pelo OAuth existente. O agente Windows em src/pc-agent/ usa o WebSocket de saída para o mesmo Worker, com secret separado PC_AGENT_TOKEN protegido por DPAPI no PC. O Durable Object PcRelay, acessado por `ctx.exports.PcRelay` sem binding `env`, hospeda a conexão WebSocket hibernável e permite encaminhar comandos a partir de chamadas independentes do Worker. Sem secret as ferramentas pc_* não são registradas; sem computador conectado elas retornam offline. Capturas JPEG são preservadas como conteúdo MCP do tipo imagem. Essa integração não utiliza D1 e não muda os domínios de ponto e gastos. Limites, regras, configuração e testes constam em [docs/CONTROLE-PC.md](CONTROLE-PC.md).
