# Assistente MCPs

Servidor MCP único em Cloudflare Workers, implementado em JavaScript puro (ES Modules), que oferece as skills Ponto, Gastos e Desenvolvimento e encaminha chamadas aos MCPs oficiais GitHub e Cloudflare.

ChatGPT → Assistente MCPs (Worker Cloudflare) → MCPs GitHub e Cloudflare oficiais + skills locais.

## Estado

A integração está na `main`. O CI passou com testes simulados de OAuth, verificação das skills e build dry-run para produção e preview. O Worker encaminha ferramentas oficiais sem copiá-las ou redefini-las.

A validação real de OAuth ainda depende da configuração e do consentimento dos provedores. O código foi integrado, mas a versão ativa de produção não foi promovida; produção e D1 permanecem sem alteração. As etapas para configurar e validar os provedores estão em docs/OAUTH-UPSTREAM.md.

## Componentes

- server/worker.js: servidor MCP do Assistente, catálogo de skills e ferramentas proxy genéricas.
- server/upstream-oauth.js: discovery, consentimento, tokens cifrados, refresh e desconexão dos provedores.
- server/remote-client.js e server/remote-tools.js: cliente MCP HTTPS e encaminhamento dinâmico.
- skills/: instruções em Markdown sincronizadas com o catálogo do Worker.
- docs/: arquitetura, autenticação e limites.

## Desenvolvimento

    npm ci
    npm run check

O GitHub é a fonte de verdade deste projeto: joaoldsxyzbr/Assistente-mcps. O CI verifica sintaxe, sincronização de skills, testes e build dry-run. Testes de ponto/gastos nunca escrevem nos bancos D1 reais. A configuração inclui um alvo de preview isolado com KV próprio; OAuth real ainda depende de secrets e consentimento. Deploy de preview e promoção de produção são operações distintas.
