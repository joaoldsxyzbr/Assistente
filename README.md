# Assistente MCPs

Servidor MCP único em Cloudflare Workers, implementado em JavaScript puro (ES Modules), que oferece as skills Ponto, Gastos e Desenvolvimento e encaminha chamadas aos MCPs oficiais GitHub e Cloudflare.

ChatGPT → Assistente MCPs (Worker Cloudflare) → MCPs GitHub e Cloudflare oficiais + skills locais.

## Estado

O projeto está na `main` e o Worker está publicado em https://assistente.joaolds.xyz.br/mcp. O Worker encaminha ferramentas oficiais sem copiá-las ou redefini-las.

As credenciais de produção estão configuradas. A autorização das contas e a leitura real de cada MCP dependem do consentimento do operador; testes simulados não comprovam esse consentimento. Veja docs/OAUTH-UPSTREAM.md e docs/AUDITORIA-2026-10-16.md.

## Componentes

- mcps/github/ e mcps/cloudflare/: configurações e etapas OAuth específicas de cada provedor.
- server/worker.js: entrada e configuração OAuth do Worker.
- server/mcp-server.js: catálogo de skills e ferramentas proxy genéricas.
- server/upstream-oauth.js: fluxo OAuth compartilhado, discovery, PKCE e tokens cifrados.
- server/remote-client.js e server/remote-tools.js: cliente MCP HTTPS e encaminhamento dinâmico.
- skills/: instruções em Markdown sincronizadas com o catálogo do Worker.
- docs/: arquitetura, autenticação e limites.

## Desenvolvimento

    npm ci
    npx playwright install --with-deps chromium
    npm run check
    npm run test:browser
    npm run test:runtime

O GitHub é a fonte de verdade deste projeto: joaoldsxyzbr/Assistente-mcps. O CI verifica sintaxe, sincronização de skills, testes de protocolo/OAuth e navegador Chromium, além de build dry-run. Testes de ponto/gastos nunca escrevem nos bancos D1 reais. Não há ambiente de Preview: a validação ocorre no CI e em build dry-run, seguida de publicação controlada com rollback. O upload de uma versão **não** a coloca em produção automaticamente.

## Otimização de segurança e chamadas MCP

A validação OAuth exige PKCE S256 explícito no metadata oficial e a configuração Wrangler declara os nomes dos secrets obrigatórios. A execução `mcp_*_call` chama diretamente o MCP oficial pelo nome, **sem repetir `listTools`**; a descoberta seletiva continua disponível via `mcp_*_tools`. Não há cache de resultados privados, mudança de escopos ou reautorização automática. Decisões, testes e rollback: [docs/OTIMIZACAO-2026-10-19.md](docs/OTIMIZACAO-2026-10-19.md).

## Manutenção (19/10/2026)

Apenas `ci.yml` e `dependency-security.yml` continuam versionados em `.github/workflows/`. O Preview foi desativado e seu trigger de builds removido, sem modificar a autenticação, o serviço produtivo ou os bancos D1. A [limpeza operacional](docs/LIMPEZA-2026-10-19.md) registra o que foi executado, o que permanece no histórico e o procedimento de rotação segura do segredo GitHub, caso ainda necessário.

## Robustez e publicação

Os catálogos oficiais são paginados por padrão: `mcp_github_tools` e `mcp_cloudflare_tools` retornam 20 ferramentas resumidas. Use `query` com palavras do nome ou descrição (ex.: `get file`): correspondências no nome têm preferência, e a descrição funciona como alternativa; se houver uma única correspondência, um `inputSchema` compacto já é incluído, evitando a consulta separada por `name`. `cursor` e `limit` paginam; `name` continua disponível para obter o schema completo. As chamadas remotas continuam textuais (64 KiB), e a leitura HTTP upstream tem limite de 2 MiB por stream.

Rate limiting nativo em Cloudflare: 120 chamadas MCP autenticadas por minuto por operador, 15 tentativas de autorização por minuto por endereço na borda, em produção. Eventos de duração e resultado são registrados sem argumentos ou tokens.

Antes de publicar: `npm run check`, `npm run test:browser`, `npm run test:runtime`, verificação de bindings e promoção explícita da versão pela Cloudflare. Detalhes, limites, checklist e reversão: [docs/ROBUSTEZ-2026-10-17.md](docs/ROBUSTEZ-2026-10-17.md).
