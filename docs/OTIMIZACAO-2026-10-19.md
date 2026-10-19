# Otimização de segurança e execução MCP — 19/10/2026

## Escopo autorizado

Reforçar o OAuth e eliminar a enumeração redundante de ferramentas por execução. Preservar o Worker único, GitHub e Cloudflare oficiais, as três skills, os bancos D1 e a autenticação já concedida. **Não criar Preview**, migrar arquitetura, adicionar dependências, mudar escopos OAuth ou fazer escritas no D1.

## Mudanças

1. `server/upstream-oauth.js`: validação de Authorization Server Metadata **exige** `code_challenge_methods_supported` como array que inclua `S256`. Ausência, tipo inválido ou apenas `plain` falham com `OAUTH_PKCE_UNSUPPORTED`. A regra também vale para o cache de metadados públicos. O fluxo Authorization Code + PKCE já existente permanece inalterado.
2. `wrangler.assistente.jsonc`: `secrets.required` declara `ASSISTENTE_OAUTH_PASSWORD`, `UPSTREAM_OAUTH_ENCRYPTION_KEY`, `GITHUB_OAUTH_CLIENT_ID` e `GITHUB_OAUTH_CLIENT_SECRET`. São apenas **nomes**, nunca valores. Todos já estão configurados na versão produtiva anterior, mas o novo build precisa validar sua presença.
3. `server/remote-tools.js`: `mcp_github_call` e `mcp_cloudflare_call` passam a fazer `callTool` diretamente após conectar, sem `listTools` prévio. O servidor oficial valida nomes e parâmetros; erros continuam sinalizados como falha/incerteza, sem repetição automática. `mcp_*_tools` mantém a busca seletiva com schema por demanda, sem alterações.
4. Testes de regressão para PKCE inválido (GitHub/Cloudflare), metadados em cache, chamada direta, erros desconhecidos e preservação do contrato.

## Segurança e decisões

- A configuração atual `GITHUB_OAUTH_SCOPES` inclui permissões amplas porque o MCP oficial opera com toolset completo. **Não reduzir automaticamente:** alterações de consentimento podem bloquear ferramentas já em uso. Revisar permissões numa tarefa separada, com mapeamento das operações realmente utilizadas.
- `assistente_status` não comprova todas as permissões upstream; use leitura real segura em GitHub e Cloudflare após publicação.
- A recomendação histórica de **rotacionar o client secret GitHub anteriormente exposto** segue pendente até confirmação do operador. A rotação requer procedimento cuidadoso e atualização do segredo no Worker; não registrar valor em chat, repo ou logs. Esta entrega não substitui secrets.
- O SDK MCP permite `callTool` pelo nome sem `listTools` anterior. Não há cache extra de tokens nem mudança nos fluxos OAuth.
- Um erro em escrita remota pode deixar a conclusão incerta: **consultar o estado no provedor antes de repetir**.

## Aceite / publicação

1. Revisar alterações e testes sem inserir secrets nem gravar em D1 real.
2. CI: sintaxe, skills sincronizadas, testes Node, Chromium, Workerd e dry-run aprovado.
3. Workers Build da `main` concluído com sucesso. `wrangler versions upload` envia versão, **não publica sozinho**.
4. Conferir os bindings e publicar a versão validada para 100% do tráfego somente após CI e build.
5. Testes de leitura reais: GitHub `get_me` e `get_file_contents`, Cloudflare `whoami`, catálogo por filtro e `assistente_status`.
6. Se houver problema, promover a versão anterior confirmada pelo histórico de Deployments.

## Referências

- [MCP: PKCE e segurança](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP SDK: chamadas de ferramentas](https://ts.sdk.modelcontextprotocol.io/v2/clients/calling)
- [Cloudflare: secrets.required](https://developers.cloudflare.com/workers/wrangler/configuration/#secrets)

## Registro de publicação

- PR [#88](https://github.com/joaoldsxyzbr/Assistente-mcps/pull/88) integrado à `main` no commit `58dd2c57b308d2446a416eac5172443a2a5de69d`.
- CI da `main`: [concluído com sucesso](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39239215801) (sintaxe, skills, testes Node, Chromium, Workerd, build dry-run).
- Cloudflare Workers Build da `main`: `success`, versão carregada `eababc9c-d833-42fb-9c73-cf0ff9370282`.
- Deploy de produção `ce2e75a3-a3df-4e61-a7c8-65f9a90f6956`: versão nova **100% do tráfego**, confirmado por leitura da API Cloudflare.
- Bindings: **15 idênticos** aos da versão anterior, inclusive `OAUTH_KV`, rate limiters e quatro nomes de secrets, sem divulgar valores.
- Testes pós-publicação: `assistente_status` confirmou três skills e ambos os OAuth conectados; busca GitHub `get file` retornou `get_file_contents` com schema; busca Cloudflare `whoami` retornou uma ferramenta; leituras reais `get_me`, `get_file_contents` e `whoami` executadas com êxito **já na versão nova**.
- Versão anterior confirmada para rollback: `23746209-3f31-4726-b52f-cf6edf875821`. A nova implementação não foi submetida a benchmark de p95; não afirmar ganho numérico sem medi-lo.
- Nota operacional: o check externo adicional de Workers Builds em um Preview gerado por integração antiga falhou com token inválido (10000/9109); CI principal e build do Worker `assistente` passaram. A correção desse check não foi feita porque o usuário não quer adicionar/manter fluxo de Preview para este trabalho.
- Rotação do client secret do GitHub, anteriormente exposto em conversa, **não foi executada nem confirmada**; requer procedimento operacional separado com atualização segura no Worker.
