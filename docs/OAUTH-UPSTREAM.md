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

Não guardar nenhum desses valores no repositório. A publicação usa apenas o Worker de produção e os secrets já cadastrados na Cloudflare. Uma nova versão deve manter todos os bindings existentes.

## Rotação segura do segredo OAuth GitHub

O client secret do OAuth App foi compartilhado anteriormente em uma conversa e sua rotação **ainda não está comprovada**. A criação de um novo client secret é feita pelo proprietário no [GitHub Developer Settings](https://github.com/settings/developers), em **OAuth Apps → aplicativo do Assistente → Generate a new client secret**. O conector GitHub disponível para o projeto não tem operação para gerar esse segredo.

1. Gere um novo secret no GitHub, mantendo o antigo temporariamente durante a transição.
2. Atualize **GITHUB_OAUTH_CLIENT_SECRET** diretamente na aba Settings/Variables and Secrets do Worker `assistente` na Cloudflare (sem enviá-lo ao chat ou ao GitHub). Se usar Wrangler, execute `npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --config wrangler.assistente.jsonc` em um terminal local autenticado.
3. Confira qual versão ficou publicada, teste uma **nova autorização OAuth GitHub** e uma leitura real `get_me`. Se a troca do secret invalidar a autorização atual, reconecte pelo fluxo OAuth oficial.
4. Só depois de verificar a autenticação com o novo valor, remova/revogue o segredo antigo nas configurações do OAuth App. Não troque `UPSTREAM_OAUTH_ENCRYPTION_KEY` nessa operação.

A criação e inclusão do novo valor são ações externas que exigem o usuário autenticado à UI do OAuth App GitHub; **não considere a rotação executada** apenas pela presença de secrets no Worker.

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
- O antigo ambiente de Preview foi descontinuado; tokens OAuth e registros do Worker de produção não são compartilhados com outro ambiente. Publicar código não concede autorização upstream automaticamente.

## Fontes oficiais

- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- https://github.com/cloudflare/mcp
- https://modelcontextprotocol.io/specification/latest/basic/authorization
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action
