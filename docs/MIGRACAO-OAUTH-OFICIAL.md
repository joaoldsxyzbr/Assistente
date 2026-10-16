# Migração para MCPs oficiais

## Situação de destino

O Worker `assistente` continua ativo apenas como **servidor MCP das skills**. GitHub e Cloudflare são conectados **diretamente ao ChatGPT** com seus OAuth oficiais. Ponto e gastos são exclusivamente instruções que usam o MCP da Cloudflare, não ferramentas próprias do Worker.

## Mudanças

- Remover do catálogo público as ferramentas próprias `ponto_*`, `gastos_*`, `mcp_github__*`, `mcp_cloudflare__*` e os diagnósticos próprios.
- Conservar `assistente_skill` e `assistente_status`.
- Conservar proteção OAuth atual para o Worker até migração específica de identidade.
- Remover dependência operacional de `MCP_GITHUB_TOKEN` e `MCP_CLOUDFLARE_TOKEN` sem alterar secrets existentes em produção.
- Preservar as validações e SQL testadas das skills no histórico Git como referência.
- Atualizar README, catálogo de skills, testes e configurações no mesmo commit.

## Validação necessária

1. CI do GitHub e build Cloudflare verdes.
2. Login OAuth **novo** do MCP Assistente funcionando no ChatGPT.
3. OAuth do GitHub e Cloudflare oficiais autorizados no ChatGPT.
4. Consultas somente leitura no D1 correto e operações de escrita apenas quando houver pedido real.
5. Promover a versão somente depois de testar; limpar secrets antigos no painel só após confirmação.

**Aviso:** este fluxo usa três conexões no ChatGPT, não um único token OAuth compartilhado. A alternativa de um único hub com acesso delegado a GitHub/Cloudflare exigiria fluxos OAuth upstream com armazenamento de tokens e maior complexidade.
