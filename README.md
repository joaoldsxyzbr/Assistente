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
- **Controle de gastos:** continua fora deste repositório e sob as regras do plugin Assistente Geral.

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
