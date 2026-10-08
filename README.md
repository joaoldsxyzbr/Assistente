# Assistente

O **Assistente** é o hub MCP do plugin **Assistente Geral**. O plugin cuida das skills e regras de conversa; este repositório mantém um único Worker que autentica o ChatGPT e encaminha somente as ferramentas MCP declaradas localmente.

## Arquitetura

- **1 Worker:** `assistente`.
- **1 endpoint MCP:** `https://assistente.joaolds.xyz.br/mcp`.
- **1 módulo por MCP/domínio:** `src/mcps/<nome>`.
- **Allowlist local:** configurar um MCP não publica ferramentas automaticamente.
- **Assistente Geral:** usa o app **Assistente MCPs** como sua conexão MCP; não depende diretamente do app Cloudflare.
- **Cloudflare MCP:** integração genérica atrás do hub, com `docs`, `search` e `execute`.
- **GitHub MCP oficial:** integração remota via PAT separado, com ferramentas de repositório, branches, arquivos, issues, PRs e Actions; **sem restringir o MCP a um repositório fixo**.
- **Controle de ponto:** ferramentas locais `ponto_registrar`, `ponto_hoje` e `ponto_resumo` usam somente o Cloudflare MCP para consultar/escrever no D1; o Worker não possui binding D1.
- **Controle de gastos:** cinco ferramentas locais (`gastos_resumo`, `gastos_listar`, `gastos_registrar`, `gastos_atualizar`, `gastos_excluir`) usam o Cloudflare MCP para o D1 canônico, sem binding D1 no Worker.

- **Controle do PC (opcional):** ferramentas `pc_*` com aplicativo Windows em C# na **bandeja do sistema, sem console**, conexão WebSocket e reconexão automática ao Worker existente. O menu oferece status, reconectar, configurar token, iniciar com Windows (opcional) e sair. Consulte [docs/CONTROLE-PC.md](docs/CONTROLE-PC.md); exige `PC_AGENT_TOKEN` como secret, fora do Git.

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

## GitHub MCP oficial

O Assistente conecta o GitHub **por MCP remoto**, sem chamadas diretas à API GitHub, usando apenas ferramentas locais aprovadas em `src/mcps/github/tools.ts`. O servidor oficial recebe o header `X-MCP-Toolsets: context,repos,issues,pull_requests,actions`; a allowlist do Assistente publica apenas um subconjunto estável (leitura e escrita). [Documentação oficial](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md).

**Nenhum repositório é fixado no código**. Em cada chamada, `owner` e `repo` são passados conforme a tarefa. O acesso real aos repositórios é limitado **pelas permissões do token GitHub**, não pela configuração do MCP. As regras deste projeto continuam exigindo trabalhar somente em `joaoldsxyzbr/Assistente` quando a tarefa for sobre este repositório.

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

O **Assistente Geral** usa cinco ferramentas do **Assistente MCPs**: `gastos_resumo`, `gastos_listar`, `gastos_registrar`, `gastos_atualizar` e `gastos_excluir`. O período omitido é **o próximo mês** em `America/Sao_Paulo`; `periodo: "MM/AAAA"` prevalece. Não existe binding D1 no Worker: o caminho permanece `Assistente Geral → Assistente MCPs → Cloudflare MCP → D1`.

- Consulta não cria tabelas. Somente registro autorizado de um novo mês copia um schema mensal existente, sem copiar dados.
- Valores TEXT são interpretados em centavos inteiros com validação rigorosa, nunca somados via `SUM(valor)`. Registros com valor inválido impedem confirmação de totais.
- Edição e exclusão exigem ID ou descrição inequívoca; escrita condicionada ao estado observado bloqueia sobrescrever alterações concorrentes. Lançamentos duplicados exigem confirmação de que são transações distintas.
- O status de lançamento novo é `pendente`, salvo pedido explícito de pago. Não há recorrência automática nem migração de dados.
- `GASTOS_D1_DATABASE_ID` está no Wrangler; testes de escrita usam **somente SQLite em memória**, não valores pessoais.

A skill `assistente-controle-de-gastos` deve chamar diretamente essas ferramentas para pedidos rotineiros, mantendo o executor genérico reservado às exceções.

## Checks de PR e Deploy

O **CI do GitHub** valida `npm run check`. **Workers Builds** é um check externo independente e requer seu próprio token de build válido. O deploy da branch `main` faz upload de uma versão, mas **não promove automaticamente** o tráfego; valide a versão ativa e faça a promoção separadamente quando solicitada.

Se um check de PR da Cloudflare falhar com `Authentication error [10000]` ou `Invalid access token [9109]` ao executar `wrangler preview`, revise **Settings → Builds → API token** no painel do Worker e a permissão da credencial associada ao trigger de preview. Não desabilite o check nem force uma dependência apenas para ocultar o erro. Registre o incidente em Issues e reexecute o check após corrigir a credencial.

Os SDKs MCP devem permanecer alinhados com os `peerDependencies` de `agents`; não usar `--force` ou `--legacy-peer-deps` para atualizar client/server isoladamente.

## Confiabilidade das chamadas MCP

As conexões remotas têm limite de 15 segundos para conectar e 45 segundos por chamada de ferramenta. Erros e timeouts usam mensagens fixas, sem exibir respostas internas nem credenciais. Falhas após iniciar uma chamada de escrita são **resultado incerto**: consultar o serviço de origem antes de repetir, sem retry automático. Consultas de leitura podem ser tentadas novamente.

Os testes automatizados cobrem timeouts, classificação de falhas e exigência de escopos em operações de leitura e escrita. Um login OAuth totalmente novo e sua renovação no ChatGPT continuam exigindo validação interativa; os testes de código não a substituem.
