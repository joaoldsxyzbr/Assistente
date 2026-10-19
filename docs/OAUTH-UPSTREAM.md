# OAuth dos MCPs upstream

## Fluxo

O OAuth de ChatGPT → Assistente MCP é independente do OAuth de Assistente → provedor. O Worker não encaminha o token de ChatGPT ao GitHub ou Cloudflare.

Para cada provedor, o Worker consulta o desafio WWW-Authenticate, busca OAuth Protected Resource Metadata e Authorization Server Metadata, valida os domínios oficiais, **exige que o metadata anuncie explicitamente PKCE S256**, inicia Authorization Code + PKCE S256 e troca o código no callback. O estado é aleatório, validado com prazo explícito de 10 minutos e removido ao processar o callback. O issuer retornado é conferido quando o provedor anuncia esse suporte. Veja os limites de concorrência do KV abaixo.

- **GitHub**: MCP remoto oficial https://api.githubcopilot.com/mcp/x/all. O servidor GitHub não oferece Dynamic Client Registration; precisa de um OAuth App próprio do projeto. O callback registrado deve ser https://assistente.joaolds.xyz.br/connections/github/callback. A conta é comparada a GITHUB_EXPECTED_LOGIN (configurada como joaoldsxyzbr).
- **Cloudflare**: MCP oficial https://mcp.cloudflare.com/mcp. O Worker registra um cliente público por Dynamic Client Registration e guarda o client ID no KV cifrado. A conta e os escopos são escolhidos no consentimento oficial Cloudflare.

Os tokens ficam cifrados com AES-GCM no binding OAUTH_KV, sob o prefixo assistente:upstream:v2:. O Worker renova tokens quando estão próximos do vencimento, se o provedor tiver emitido refresh token. A ação de desconectar tenta revogar o token; quando o provedor não oferece endpoint de revogação, o Worker apaga a cópia local e orienta revogar o acesso nas configurações da conta.

## Configuração necessária

Vars públicas no wrangler.assistente.jsonc:

- PUBLIC_ORIGIN=https://assistente.joaolds.xyz.br
- GITHUB_EXPECTED_LOGIN=joaoldsxyzbr
- GITHUB_OAUTH_SCOPES: escopos OAuth amplos para o toolset GitHub all, incluindo offline_access para refresh tokens.

Credenciais do Worker (já configuradas em produção; não publicar valores):

1. ASSISTENTE_OAUTH_PASSWORD: senha aleatória com pelo menos 32 bytes, já exigida pelo OAuth do Assistente.
2. UPSTREAM_OAUTH_ENCRYPTION_KEY: chave AES de 32 bytes codificada em base64url sem padding.
3. GITHUB_OAUTH_CLIENT_SECRET: secret do OAuth App GitHub.
4. GITHUB_OAUTH_CLIENT_ID: ID público do OAuth App, disponível como secret ou var de ambiente.

A configuração raiz usa `secrets.required` para exigir a presença dos quatro nomes no deploy de produção. Somente os nomes são versionados; os valores continuam protegidos na Cloudflare. A alteração não substitui nem rotaciona secrets existentes.

Não guardar nenhum desses valores no repositório. A configuração tem um ambiente isolado de preview com namespace KV próprio e URL https://assistente-preview.contato-24f.workers.dev; não use os comandos abaixo sem a flag --env preview, pois a configuração raiz aponta para produção.

Para configurar secrets apenas no preview, execute cada comando e informe o valor no prompt seguro:

    npx wrangler secret put ASSISTENTE_OAUTH_PASSWORD --config wrangler.assistente.jsonc --env preview
    npx wrangler secret put UPSTREAM_OAUTH_ENCRYPTION_KEY --config wrangler.assistente.jsonc --env preview
    npx wrangler secret put GITHUB_OAUTH_CLIENT_ID --config wrangler.assistente.jsonc --env preview
    npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --config wrangler.assistente.jsonc --env preview

Crie um OAuth App GitHub separado para preview, com callback https://assistente-preview.contato-24f.workers.dev/connections/github/callback. O Worker de preview usa o KV assistente-oauth-preview e não tem rota customizada nem binding D1. Rotacionar a chave de criptografia exige reconectar os provedores.
## Operação

Para testar sem tocar produção:

1. Crie um OAuth App GitHub separado para preview, com callback https://assistente-preview.contato-24f.workers.dev/connections/github/callback.
2. Faça o primeiro deploy do Worker isolado com npm run deploy:preview. Ele usa o KV assistente-oauth-preview, o domínio workers.dev e não tem rota customizada nem binding D1.
3. Configure as quatro secrets listadas acima com --env preview. O password e a chave de criptografia do preview devem ser distintos dos de produção.
4. Conecte o MCP preview no ChatGPT pela URL https://assistente-preview.contato-24f.workers.dev/mcp e autorize GitHub/Cloudflare em conexões separadas.
5. Use somente leituras no smoke test. O MCP Cloudflare pode alcançar D1 pela autorização OAuth, então não faça escrita de teste nos bancos pessoais.

Os links de consentimento upstream são https://assistente-preview.contato-24f.workers.dev/connections/github/start e https://assistente-preview.contato-24f.workers.dev/connections/cloudflare/start. assistente_status confirma o estado sem revelar tokens.
## Produção e diagnóstico

- MCP: https://assistente.joaolds.xyz.br/mcp
- Autorizar GitHub: https://assistente.joaolds.xyz.br/connections/github/start
- Autorizar Cloudflare: https://assistente.joaolds.xyz.br/connections/cloudflare/start
- A senha é `ASSISTENTE_OAUTH_PASSWORD`, definida pelo operador. Ela autoriza acesso ao Assistente; não é a senha do GitHub/Cloudflare nem o client secret do OAuth App.
- Abra novamente o link de autorização após atualizações; uma página já aberta conserva a CSP antiga. No consentimento oficial, confira conta e permissões antes de aceitar.
- A CSP dos formulários permite o próprio Worker e os hosts oficiais do respectivo provedor. O POST responde 303 para abrir o provedor por GET; a senha não integra a URL nem o corpo enviado ao provedor.
- Logs `assistente_oauth_started`, `assistente_oauth_connected` e `assistente_oauth_failure` registram somente provedor, etapa, status/código seguro e tipo de erro. Não registrar URL com query, corpo, código OAuth ou token.
- Antes de exibir o formulário de autorização, o GET verifica apenas os metadados públicos do provedor; ele não registra clientes nem emite tokens.
- Discovery é compartilhado por chamadas simultâneas no mesmo isolate e guardado no KV por endpoint: uma hora de validade normal, com uso da última versão validada por no máximo 24 horas apenas em HTTP 429, HTTP 5xx ou timeout. Recursos, issuer, hosts oficiais e PKCE continuam validados em leituras do cache. Erros de segurança ou HTTP 4xx diferentes de 429 não aceitam fallback.
- HTTP 429 respeita `Retry-After`; sem cache utilizável, o formulário informa o limite e a espera, e consultas prematuras não refazem a chamada. O diagnóstico registra a etapa (`resource_challenge`, `resource_metadata`, `authorization_metadata` ou `provider_api`) sem URL ou valores sensíveis.
- O cache discovery contém apenas documentos públicos. Tokens, estados e credenciais DCR permanecem cifrados separadamente.
- Requisições OAuth têm timeout de 15 segundos; transporte MCP tem timeout e rejeita redirecionamentos para não encaminhar credenciais a outro destino.
- `assistente_status` indica disponibilidade local do token (`verification: stored_token`); ele não comprova permissões remotas. Confirme com uma leitura real de cada MCP.

## Limites e aceite pendente

- Este Worker tem um único operador; tokens upstream são guardados por provedor, não por usuário final. Um serviço multiusuário exige armazenamento e autorização separados por identidade.
- KV tem consistência eventual e não oferece consumo atômico de estado. A remoção impede replay sequencial, mas não é uma garantia global contra callbacks simultâneos. PKCE e o código de uso único do provedor permanecem obrigatórios. Garantia global exigiria armazenamento transacional, por exemplo Durable Objects.
- Renovações simultâneas são agrupadas no mesmo isolate. Isolates distintos ainda podem disputar um refresh token rotativo; nesse caso pode ser necessário reconectar. Para volume concorrente, migrar o refresh para coordenação transacional.
- CI usa provedores simulados, incluindo clique real em Chromium e callback. Ainda falta confirmar consentimento, leitura real, renovação e revogação das contas do operador. Não fazer escritas de teste nos bancos pessoais.
- O preview usa KV e credenciais próprios. Publicar código não concede autorização upstream automaticamente.

## Fontes oficiais

- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://github.com/cloudflare/mcp
- https://modelcontextprotocol.io/specification/latest/basic/authorization
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action
