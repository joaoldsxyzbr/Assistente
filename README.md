# Assistente MCPs

Servidor MCP único em Cloudflare Workers, implementado em JavaScript puro (ES Modules), que oferece as skills Ponto, Gastos e Desenvolvimento e encaminha chamadas aos MCPs oficiais GitHub e Cloudflare.

ChatGPT → Assistente MCPs (Worker Cloudflare) → MCPs GitHub e Cloudflare oficiais + skills locais.

## Estado

A branch de integração implementa discovery OAuth upstream, Authorization Code + PKCE, DCR Cloudflare, armazenamento AES-GCM em KV, renovação quando o provedor fornece refresh token, revogação quando disponível, descoberta dinâmica de ferramentas oficiais e testes simulados. O Worker não copia nem redefine ferramentas upstream.

OAuth upstream exige configuração e consentimento independentes do OAuth do ChatGPT. Os fluxos simulados passam no CI; não há ainda validação real das contas. Não promover a produção antes de concluir as etapas em docs/OAUTH-UPSTREAM.md. Produção e D1 continuam intactos.

## Componentes

- server/worker.js: servidor MCP do Assistente, catálogo de skills e ferramentas proxy genéricas.
- server/upstream-oauth.js: discovery, consentimento, tokens cifrados, refresh e desconexão dos provedores.
- server/remote-client.js e server/remote-tools.js: cliente MCP HTTPS e encaminhamento dinâmico.
- skills/: instruções em Markdown sincronizadas com o catálogo do Worker.
- docs/: arquitetura, autenticação e limites.

## Desenvolvimento

    npm ci
    npm run check

O GitHub é a fonte de verdade deste projeto: joaoldsxyzbr/Assistente-mcps. O CI verifica sintaxe, sincronização de skills, testes e build dry-run. Testes de ponto/gastos nunca escrevem nos bancos D1 reais. Deploy de preview e promoção de produção são operações distintas.
