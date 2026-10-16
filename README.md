# Assistente MCPs

Servidor MCP único, hospedado em Cloudflare Worker, desenvolvido em **JavaScript puro (ES Modules)**. Arquivos das skills em Markdown.

```text
ChatGPT
   └── Assistente MCPs (Worker Cloudflare)
         ├── GitHub MCP oficial (upstream HTTPS)
         ├── Cloudflare MCP oficial (upstream HTTPS)
         └── Skills: ponto, gastos e desenvolvimento
```

## Estado da evolução

A branch de integração implementa a ponte de transporte MCP com URLs oficiais fixas, ferramentas de descoberta e chamada, e escopo elevado para execução remota. **Ainda não há fluxo OAuth upstream completo.** O Worker aceita access tokens dos provedores como Secrets de ambiente somente depois que a identidade e o consentimento forem configurados por processo separado. Não copiar tokens do ChatGPT, nem criar PATs para simular OAuth. Consulte [docs/OAUTH-UPSTREAM.md](docs/OAUTH-UPSTREAM.md). Sem tokens configurados, ferramentas remotas retornam aviso explícito.

**Não publicar a branch em produção como integração concluída** antes de implementar OAuth end-to-end, revogação, renovação e políticas de autorização/allowlist.

## Componentes

- `server/worker.js`: servidor MCP, OAuth do ChatGPT e roteamento das ferramentas.
- `server/remote-client.js` e `server/remote-tools.js`: transporte MCP e operações upstream.
- `skills/ponto/`, `skills/gastos/` e `skills/desenvolvimento/`: instruções.
- `docs/`: arquitetura, autenticação e limites.
- `tests/`: verificações locais e CI.

## Desenvolvimento

```sh
npm ci
npm run check
```

O GitHub é fonte de verdade. O CI verifica código, testes e build dry-run. Não executar testes de escrita nos bancos D1 reais. A entrega na Cloudflare e a promoção de versão são operações distintas.
