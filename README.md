# Assistente

O **Assistente MCPs** é o hub MCP consumido pelo plugin **Assistente**. O plugin cuida das skills e regras de conversa; este repositório mantém um único Worker que autentica o ChatGPT e encaminha somente as ferramentas MCP declaradas localmente.

## Arquitetura

O escopo ativo é exclusivamente **Cloudflare, GitHub, ponto e gastos**. A integração de controle remoto de PC foi descontinuada em 13/10/2026; seus arquivos, workflow e endpoint foram removidos. O histórico técnico permanece no Git e nas issues encerradas.


- **1 Worker:** `assistente`.
- **1 endpoint MCP:** `https://assistente.joaolds.xyz.br/mcp`.
- **1 módulo por MCP/domínio:** `src/mcps/<nome>`.
- **Allowlist local:** configurar um MCP não publica ferramentas automaticamente.
- **Assistente:** usa o app **Assistente MCPs** como sua conexão MCP; não depende diretamente do app Cloudflare.
- **Cloudflare MCP:** integração genérica atrás do hub, com `docs`, `search` e `execute`.
- **GitHub MCP oficial:** integração remota via PAT separado, com ferramentas de repositório, branches, arquivos, issues, PRs e Actions; **sem restringir o MCP a um repositório fixo**.
- **Controle de ponto:** ferramentas locais `ponto_registrar`, `ponto_hoje` e `ponto_resumo` usam somente o Cloudflare MCP para consultar/escrever no D1; o Worker não possui binding D1.
- **Controle de gastos:** cinco ferramentas locais (`gastos_resumo`, `gastos_listar`, `gastos_registrar`, `gastos_atualizar`, `gastos_excluir`) usam o Cloudflare MCP para o D1 canônico, sem binding D1 no Worker.


Detalhes e decisões duráveis ficam em [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Trabalho pendente fica em Issues.

## Autenticação

ChatGPT → Worker usa OAuth 2.1 com authorization code, PKCE, descoberta e Client ID Metadata Documents. A autorização exige a senha do proprietário em `ASSISTENTE_OAUTH_PASSWORD`.

O Worker publica:
- `mcp:read` para chamadas básicas e consultas de ponto;
- `mcp:write` para operações de escrita, como `mcp_cloudflare__execute`, `ponto_registrar` e ferramentas GitHub de alteração;
- `offline_access` para renovação da conexão.

Worker → Cloudflare MCP usa um token separado em `MCP_CLOUDFLARE_TOKEN`. Worker → GitHub MCP oficial usa `MCP_GITHUB_TOKEN`, **outro token**, sem troca de credenciais entre serviços. O OAuth do ChatGPT não é enviado aos MCPs remotos.

## Configuração de produção

A configuração declarativa está em `wrangler.assistente.jsonc`:

- custom domain: `assistente.joaolds.xyz.br`;
- `workers.dev` e previews desativados;
- KV OAuth: `OAUTH_KV`;
- endpoint remoto Cloudflare: `https://mcp.cloudflare.com/mcp`;
- endpoint remoto GitHub: `https://api.githubcopilot.com/mcp/` (`MCP_GITHUB_URL`);
- conta Cloudflare padrão: `MCP_CLOUDFLARE_ACCOUNT_ID`, usada automaticamente pelo `execute`;
- banco canônico do ponto: `PONTO_D1_DATABASE_ID`, usado apenas para montar chamadas fixas ao Cloudflare MCP.

Secrets necessários, configurados fora do Git:
- `ASSISTENTE_OAUTH_PASSWORD`;
- `MCP_CLOUDFLARE_TOKEN`;
- `MCP_GITHUB_TOKEN` (PAT GitHub; configurar no Worker apenas quando disponível).

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

**Histórico:** a migração única que eliminou o Durable Object `PcRelay` ocorreu em 13/10/2026 via `wrangler deploy` (PR #64, versão Cloudflare `89d9deb1-341b-447c-8c91-33c36c4676c0`). O código final não exporta essa classe e não inclui tombstone; o fluxo normal volta a `versions upload`. Confira o [registro da migração](docs/MIGRACAO-PC-RELAY.md) para detalhes e restrições de rollback.

## GitHub MCP oficial

O Assistente conecta o GitHub **por MCP remoto**, sem chamadas diretas à API GitHub, usando apenas ferramentas locais aprovadas em `src/mcps/github/tools.ts`. O servidor oficial recebe o header `X-MCP-Toolsets: context,repos,issues,pull_requests,actions`; a allowlist do Assistente publica apenas um subconjunto estável (leitura e escrita). [Documentação oficial](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md).

**Nenhum repositório é fixado no código**. Em cada chamada, `owner` e `repo` são passados conforme a tarefa. O acesso real aos repositórios é limitado **pelas permissões do token GitHub**, não pela configuração do MCP. As regras deste projeto continuam exigindo trabalhar somente em `joaoldsxyzbr/Assistente-mcps` quando a tarefa for sobre este repositório.

Para ativar:
1. Crie um **Personal Access Token (fine-grained)** no GitHub para os repositórios que desejar conectar (seleção ampla ou todos os repositórios da conta, se necessário), com permissões proporcionais às operações desejadas: Contents, Issues, Pull requests e Actions.
2. No painel Cloudflare do Worker `assistente`, adicione o **secret `MCP_GITHUB_TOKEN`** (não coloque no GitHub, no `wrangler.assistente.jsonc` ou no chat).
3. Faça upload da versão no Workers Builds e promova-a para **100% de tráfego**. Verifique `assistente_status` e faça uma chamada **somente de leitura** como `mcp_github__get_me` ou `mcp_github__search_repositories`.
4. Recarregue/atualize o Assistente MCPs no ChatGPT se o catálogo de ferramentas ficar em cache.

Sem secret, o GitHub permanece inativo e não interfere no Cloudflare nem nas ferramentas de ponto. Nenhuma chamada de escrita de teste é necessária.

## Verificação e simplificação (auditoria de outubro de 2026)

- Os testes de ponto incluem agora execução de SQL em SQLite em memória com datas e horários **sintéticos**, inclusive concorrência lógica, duplicação e sábado. Não há gravações de teste no D1 pessoal.
- A autenticação OAuth usa os logs estruturados já existentes, sem gravação de marcadores temporários no KV por requisição; mantemos o fluxo de registro de cliente enquanto a compatibilidade não for reavaliada após um novo login completo.
- As integrações aceitam somente os dois endpoints HTTPS oficiais configurados. Se um fornecedor mudar o endereço, atualize a validação, os testes e a configuração juntos para não enviar secrets a hosts inesperados.
- Dependabot verifica atualizações npm semanalmente; o CI existente continua o mesmo, enxuto.
- Proteção de branch `main` foi **explicitamente excluída** desta rodada pelo proprietário.

## Controle de gastos (ferramentas dedicadas)

O **Assistente** usa cinco ferramentas do **Assistente MCPs**: `gastos_resumo`, `gastos_listar`, `gastos_registrar`, `gastos_atualizar` e `gastos_excluir`. O período omitido é **o próximo mês** em `America/Sao_Paulo`; `periodo: "MM/AAAA"` prevalece. Não existe binding D1 no Worker: o caminho permanece `Assistente → Assistente MCPs → Cloudflare MCP → D1`.

- Consulta não cria tabelas. Somente registro autorizado de um novo mês copia um schema mensal existente, sem copiar dados.
- Valores TEXT são interpretados em centavos inteiros com validação rigorosa, nunca somados via `SUM(valor)`. Registros com valor inválido impedem confirmação de totais.
- Edição e exclusão exigem ID ou descrição inequívoca; escrita condicionada ao estado observado bloqueia sobrescrever alterações concorrentes. Lançamentos duplicados exigem confirmação de que são transações distintas.
- O status de lançamento novo é `pendente`, salvo pedido explícito de pago. Não há recorrência automática nem migração de dados.
- `GASTOS_D1_DATABASE_ID` está no Wrangler; testes de escrita usam **somente SQLite em memória**, não valores pessoais.

O especialista **Assistente Pessoal** deve usar diretamente essas ferramentas em pedidos rotineiros; o executor genérico fica reservado às exceções.

## Checks de PR e Deploy

O **CI do GitHub** valida `npm run check`. **Workers Builds** é um check externo independente e requer seu próprio token de build válido. O deploy da branch `main` faz upload de uma versão, mas **não promove automaticamente** o tráfego; valide a versão ativa e faça a promoção separadamente quando solicitada.

O projeto configura **dois triggers Cloudflare Builds separados**, vinculados exclusivamente ao repositório `joaoldsxyzbr/Assistente-mcps` e com token de build de usuário válido: **produção** para `main` (com `npx wrangler versions upload --config wrangler.assistente.jsonc`) e **prévia** para `*` exceto `main` (com `npx wrangler preview --config wrangler.assistente.jsonc`). A prévia não deve promover tráfego da produção nem acessar D1 real. Os triggers e seus tokens são geridos no painel/API Cloudflare, **nunca em código ou secrets do GitHub**.

O bloco `previews: {}` em `wrangler.assistente.jsonc` ativa o build de prévia **isolado e sem bindings/variáveis/secrets de produção**. Isto valida o empacotamento e a publicação de Preview, **não** o login OAuth nem funções que dependam de KV, Cloudflare/GitHub ou D1: tais testes exigiriam recursos e secrets *exclusivamente de desenvolvimento* e autorização própria. Não apontar `previews.kv_namespaces` ao `OAUTH_KV` real nem fornecer secrets reais de produção.

Em 13/10/2026, identificamos que PRs antigas usavam o token legado `assistente build token`, enquanto a `main` compilava com outro token válido. Foi criado um trigger de prévia explícito usando a mesma credencial de build válida da produção (issue #52). Valide o check de PR antes de considerar resolvida a falha. Em caso de `Authentication error [10000]` / `Invalid access token [9109]`, conferir o token **do trigger de prévia** e variáveis `CLOUDFLARE_API_TOKEN`; não desabilitar o check para mascarar falha.

Os SDKs MCP devem permanecer alinhados com os `peerDependencies` de `agents`; não usar `--force` ou `--legacy-peer-deps` para atualizar client/server isoladamente.

## Confiabilidade das chamadas MCP

As conexões remotas têm limite de 15 segundos para conectar e 45 segundos por chamada de ferramenta. Erros e timeouts usam mensagens fixas, sem exibir respostas internas nem credenciais. Falhas após iniciar uma chamada de escrita são **resultado incerto**: consultar o serviço de origem antes de repetir, sem retry automático. Consultas de leitura podem ser tentadas novamente.

Os testes automatizados cobrem timeouts, classificação de falhas e exigência de escopos em operações de leitura e escrita. Um login OAuth totalmente novo e sua renovação no ChatGPT continuam exigindo validação interativa; os testes de código não a substituem.

## Endurecimento e operação (auditoria #67)

- O hub acrescenta identificador aleatório (`traceId`) e duração em milissegundos (`durationMs`) às mensagens MCP. Nenhum argumento, credencial ou dado de banco é logado. Filtre `mcp_request` e `upstream_tool_call` pelo identificador; calcule p50/p95 **com medições reais** antes de otimizar.
- Se o MCP remoto sinaliza `isError` após iniciar escrita, o resultado é **incerto** e o erro interno não é exibido. Reconcilie no serviço de origem antes de repetir.
- A prevenção de duplicatas de gastos passa a normalizar acentos portugueses e espaços no comando SQL atômico. Valores legados também são comparados na verificação prévia; nenhuma tabela auxiliar ou migração de D1 é criada.
- A clonagem de esquema mensal escolhe mês e ano cronologicamente, não por ordenação lexical.
- `.github/workflows/dependency-security.yml` executa `npm audit --audit-level=high` semanalmente ou manualmente. **Não atrasa** o CI normal; não atualiza versões automaticamente.
- **Rate limit OAuth:** conferir no painel Cloudflare uma regra WAF/rate limiting limitada a `/authorize` (de preferência apenas POST e host específico, quando o plano permitir). A API do token atual não permitiu consultar regras WAF. **Não considerar a proteção ativa sem verificação, nem criar regra ampla às cegas**. Referência: https://developers.cloudflare.com/waf/rate-limiting-rules/.
- **OAuth real:** validar login novo, escopos, negação de escrita sem `mcp:write` e renovação pelo ChatGPT após a promoção. Testes automatizados não comprovam autenticação interativa.
- **Catálogo antigo:** ferramentas `pc_*` foram removidas do backend. Se aparecem no ChatGPT, atualizar/reconectar **Assistente MCPs** no cliente; requisições antigas podem retornar `Tool not found`.
- **Deploy:** CI e upload não comprovam promoção; conferir versão ativa e leituras MCP após cada implantação.
