# Organização por integração

Cada provedor mantém o próprio código em `mcps/<provedor>/`.

- `mcps/github/`: configuração e autenticação OAuth upstream GitHub (`oauth.js`), registro das ferramentas em `index.js`, operações de edição exata e realocação em `tools/`, testes dessas operações em `tests/`.
- `mcps/cloudflare/`: configuração e autenticação OAuth upstream Cloudflare (`oauth.js`) e registro em `index.js`. Futuras ferramentas Cloudflare específicas devem ficar em `tools/`.
- `server/`: Worker, registro geral do servidor MCP, transporte, lógica de OAuth do ChatGPT e componentes compartilhados. A lógica genérica de OAuth upstream fica compartilhada.
- `tests/`: testes de integração e infraestrutura comuns a mais de um provedor.

Não criamos arquivos vazios para ferramentas futuras, e os nomes públicos MCP, endpoints oficiais e escopos OAuth permanecem os mesmos.

Comandos de verificação: `npm run check`, `npm run test:browser`, `npm run test:runtime`.
