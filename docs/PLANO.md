# Plano de implementação

O repositório acompanha o hub MCP Assistente. O plugin `Assistente Geral` permanece como entrada no ChatGPT e fonte canônica das skills/regras de domínio. A fundação anterior foi integrada à `main`; este plano realinha o código para um hub de integrações MCP, com Cloudflare como primeiro conector.

## Etapas

- [x] Definir o plugin como camada de skills/regras e o Worker Assistente como gateway técnico.
- [x] Definir uma pasta por MCP em `src/mcps/<nome>`, com um único Worker host no deploy.
- [x] Remover do escopo os MCPs de Ponto/Gastos e os bindings D1; preservar os bancos existentes sem alteração.
- [x] Implementar o contrato allowlist inicial do Cloudflare MCP: `docs`, `search` e `execute`.
- [x] Ajustar CI/build para validar somente o Worker host.
- [ ] Implementar OAuth 2.1 entre o plugin Assistente Geral e o Worker host, com authorization code + PKCE e renovação de sessão.
- [ ] Configurar o domínio `assistente.joaolds.xyz.br` e validar DNS/TLS.
- [ ] Configurar endpoint e credencial de serviço host→Cloudflare MCP como secrets do Worker Assistente.
- [ ] Garantir que o API Token `Assistente Cloudflare` esteja no runtime do MCP que chama a Cloudflare API e tenha apenas os escopos necessários.
- [ ] Conectar o endpoint do host ao plugin `Assistente Geral` e validar a descoberta e o uso das ferramentas via ChatGPT/MCP Inspector.
- [ ] Validar `docs` e `search` primeiro; depois testar operações Cloudflare de leitura e escrita, com permissões mínimas e verificação de estado.
- [ ] Adicionar cada novo MCP em uma pasta própria, com contrato allowlist, autenticação e testes correspondentes.

## Critério para publicação

O host só deve ser ativado depois de configurar OAuth, domínio e secrets. A primeira validação integrada deve começar por ferramentas de leitura. `execute` pode alterar recursos conforme as permissões do API Token Cloudflare; valide cada operação em ambiente e escopo autorizados.

Este realinhamento não apaga nem altera os bancos D1 de Ponto e Gastos. Nenhum Worker deve acessar esses bancos como parte deste projeto.
