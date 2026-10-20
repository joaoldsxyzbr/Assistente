# Assistente MCPs

Servidor MCP único em Cloudflare Workers, implementado em JavaScript puro (ES Modules), que encaminha chamadas aos MCPs oficiais GitHub e Cloudflare.

Cliente MCP (ChatGPT, Vibe Work) → Assistente MCPs (Worker Cloudflare) → MCPs GitHub e Cloudflare oficiais.

## Estado

O projeto está na `main` e o Worker está publicado em https://assistente.joaolds.xyz.br/mcp. O Worker encaminha ferramentas oficiais sem copiá-las ou redefini-las. As skills locais (ponto, gastos, desenvolvimento) foram removidas em 20/10/2026 por decisão do operador; o Vibe Work é o consumidor principal e o histórico permanece no Git.

**Catálogo de ferramentas:** o Worker publica sete ferramentas MCP. A remoção intencional de `assistente_skill` em 20/10/2026 pode exigir atualizar/reconectar o app no ChatGPT ou Vibe Work para recarregar o catálogo. Não restaure skills ou bancos D1 por causa de uma ferramenta antiga no cliente. Veja [estado atual](docs/ESTADO-ATUAL.md). [Fechamento da auditoria](docs/FECHAMENTO-AUDITORIA-2026-10-20.md).

As credenciais de produção estão configuradas. A autorização das contas e a leitura real de cada MCP dependem do consentimento do operador; testes simulados não comprovam esse consentimento. Veja docs/OAUTH-UPSTREAM.md e docs/AUDITORIA-2026-10-16.md.

## Componentes

- mcps/github/ e mcps/cloudflare/: configurações e etapas OAuth específicas de cada provedor.
- server/worker.js: entrada e configuração OAuth do Worker.
- server/mcp-server.js: ferramenta de estado das conexões e ferramentas proxy genéricas.
- server/upstream-oauth.js: fluxo OAuth compartilhado, discovery, PKCE e tokens cifrados.
- server/remote-client.js e server/remote-tools.js: cliente MCP HTTPS e encaminhamento dinâmico.
- server/github-relocation.js e server/github-exact-edit.js: reorganização e edição segura de repositórios, sem transferir conteúdo pelo chat.
- docs/: arquitetura, autenticação e limites.

## Desenvolvimento

    npm ci
    npx playwright install --with-deps chromium
    npm run check
    npm run test:browser
    npm run test:runtime

O GitHub é a fonte de verdade deste projeto: joaoldsxyzbr/Assistente-mcps. O CI verifica sintaxe, testes de protocolo/OAuth e navegador Chromium, além de build dry-run. Não há ambiente de Preview: a validação ocorre no CI e em build dry-run, seguida de publicação controlada com rollback. O upload de uma versão **não** a coloca em produção automaticamente.

## Otimização de segurança e chamadas MCP

A validação OAuth exige PKCE S256 explícito no metadata oficial e a configuração Wrangler declara os nomes dos secrets obrigatórios. A execução `mcp_*_call` chama diretamente o MCP oficial pelo nome, **sem repetir `listTools`**; a descoberta seletiva continua disponível via `mcp_*_tools`. Não há cache de resultados privados, mudança de escopos ou reautorização automática. Decisões, testes e rollback: [docs/OTIMIZACAO-2026-10-19.md](docs/OTIMIZACAO-2026-10-19.md).

## Manutenção (19/10/2026)

Os workflows permanentes são `ci.yml`, `dependency-security.yml` e `cleanup-merged-branches.yml` (manual, diagnóstico por padrão). A limpeza conservadora de branches usa somente JavaScript nativo, verifica PR mesclado e SHA atual e preserva branches sem merge ou com PR aberto. O Preview foi desativado e seu trigger de builds removido, sem modificar a autenticação, o serviço produtivo ou os bancos D1. A [limpeza operacional](docs/LIMPEZA-2026-10-19.md) registra o que foi executado, o que permanece no histórico e o procedimento de rotação segura do segredo GitHub, caso ainda necessário.

## Robustez e publicação

Os catálogos oficiais são paginados por padrão: `mcp_github_tools` e `mcp_cloudflare_tools` retornam 20 ferramentas resumidas. Use `query` com palavras do nome ou descrição (ex.: `get file`): correspondências no nome têm preferência, e a descrição funciona como alternativa; se houver uma única correspondência, um `inputSchema` compacto já é incluído, evitando a consulta separada por `name`. `cursor` e `limit` paginam; `name` continua disponível para obter o schema completo. As chamadas remotas continuam textuais (64 KiB), e a leitura HTTP upstream tem limite de 2 MiB por stream.

Rate limiting nativo em Cloudflare: 120 chamadas MCP autenticadas por minuto por operador, 15 tentativas de autorização por minuto por endereço na borda, em produção. Eventos de duração e resultado são registrados sem argumentos ou tokens.

Antes de publicar: `npm run check`, `npm run test:browser`, `npm run test:runtime`, verificação de bindings e promoção explícita da versão pela Cloudflare. Detalhes, limites, checklist e reversão: [docs/ROBUSTEZ-2026-10-17.md](docs/ROBUSTEZ-2026-10-17.md).

## Reorganização de pastas sem lotes grandes

A ferramenta `github_relocate_directory` copia ou move diretórios na branch usando a API Git Database oficial do GitHub e o **mesmo OAuth já conectado**. Reaproveita o SHA dos arquivos sem reenviar seu conteúdo. Faça uma prévia (`dryRun: true`) e depois confirme com `dryRun: false`, `expectedHeadSha` e `message`. Não sobrescreve arquivos diferentes, não grava diretamente na `main` e não edita imports. As ferramentas oficiais MCP continuam responsáveis pelas edições comuns.

Guia: [docs/RELOCACAO-GITHUB-2026-10-19.md](docs/RELOCACAO-GITHUB-2026-10-19.md).