# Plano de implementação

O repositório acompanha o hub MCP Assistente. O plugin Assistente Geral permanece como entrada no ChatGPT e fonte canônica das skills/regras de domínio. A fundação está na main, com Cloudflare como primeiro conector.

## Etapas

- [x] Definir o plugin como camada de skills/regras e o Worker Assistente como gateway técnico.
- [x] Definir uma pasta por MCP em src/mcps/<nome>, com um único Worker host no deploy.
- [x] Remover do escopo os MCPs de Ponto/Gastos e os bindings D1; preservar os bancos existentes sem alteração.
- [x] Implementar o contrato allowlist inicial do Cloudflare MCP: docs, search e execute.
- [x] Ajustar CI/build para validar somente o Worker host.
- [x] Implementar OAuth 2.1 com authorization code + PKCE, descoberta, Client ID Metadata Documents, registro dinâmico e refresh tokens.
- [x] Criar KV dedicado para tokens e dados de clientes OAuth.
- [x] Apontar o domínio assistente.joaolds.xyz.br para o Worker host.
- [x] Configurar o endpoint do Cloudflare MCP como variável não secreta.
- [x] Manter o API Token Assistente Cloudflare como secret de serviço Worker → Cloudflare MCP.
- [ ] Configurar o secret ASSISTENTE_OAUTH_PASSWORD no Worker.
- [ ] Ativar a versão OAuth e validar o endpoint no ChatGPT.
- [ ] Testar docs e search; depois testar execute com operações de leitura e escrita nos escopos permitidos.
- [ ] Adicionar cada MCP futuro em pasta própria com contrato allowlist, autenticação e testes correspondentes.

## Critério para publicação

A versão corrigida fica disponível após configurar ASSISTENTE_OAUTH_PASSWORD e ativar o Worker. A validação integrada começa com ferramentas de leitura. execute pode alterar recursos conforme as permissões do API Token Cloudflare; verifique cada operação no escopo autorizado.

Este projeto não contém nem altera os bancos D1 de Ponto e Gastos.
