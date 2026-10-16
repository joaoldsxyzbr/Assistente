# OAuth dos MCPs upstream

## Fluxo

O OAuth de ChatGPT → Assistente MCP é independente do OAuth de Assistente → provedor. O Worker não encaminha o token de ChatGPT ao GitHub ou Cloudflare.

Para cada provedor, o Worker consulta o desafio WWW-Authenticate, busca OAuth Protected Resource Metadata e Authorization Server Metadata, valida os domínios oficiais, inicia Authorization Code + PKCE S256 e troca o código no callback. O estado é aleatório, de uso único e expira após 10 minutos.

- **GitHub**: MCP remoto oficial https://api.githubcopilot.com/mcp/x/all. O servidor GitHub não oferece Dynamic Client Registration; precisa de um OAuth App próprio do projeto. O callback registrado deve ser https://assistente.joaolds.xyz.br/connections/github/callback. A conta é comparada a GITHUB_EXPECTED_LOGIN (configurada como joaoldsxyzbr).
- **Cloudflare**: MCP oficial https://mcp.cloudflare.com/mcp. O Worker registra um cliente público por Dynamic Client Registration e guarda o client ID no KV cifrado. A conta e os escopos são escolhidos no consentimento oficial Cloudflare.

Os tokens ficam cifrados com AES-GCM no binding OAUTH_KV, sob o prefixo assistente:upstream:v2:. O Worker renova tokens quando estão próximos do vencimento, se o provedor tiver emitido refresh token. A ação de desconectar tenta revogar o token; quando o provedor não oferece endpoint de revogação, o Worker apaga a cópia local e orienta revogar o acesso nas configurações da conta.

## Configuração necessária

Vars públicas no wrangler.assistente.jsonc:

- PUBLIC_ORIGIN=https://assistente.joaolds.xyz.br
- GITHUB_EXPECTED_LOGIN=joaoldsxyzbr
- GITHUB_OAUTH_SCOPES: escopos OAuth amplos para o toolset GitHub all, incluindo offline_access para refresh tokens.

Secrets do Worker, nunca do GitHub nem da conversa:

1. ASSISTENTE_OAUTH_PASSWORD: senha aleatória com pelo menos 32 bytes, já exigida pelo OAuth do Assistente.
2. UPSTREAM_OAUTH_ENCRYPTION_KEY: chave AES de 32 bytes codificada em base64url sem padding.
3. GITHUB_OAUTH_CLIENT_SECRET: secret do OAuth App GitHub.
4. GITHUB_OAUTH_CLIENT_ID: ID público do OAuth App, disponível como secret ou var de ambiente.

Não guardar nenhum desses valores no repositório. Para configurar secrets pelo Wrangler, execute o comando e informe o valor no prompt seguro:

    npx wrangler secret put UPSTREAM_OAUTH_ENCRYPTION_KEY --config wrangler.assistente.jsonc
    npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET --config wrangler.assistente.jsonc\n    npx wrangler secret put GITHUB_OAUTH_CLIENT_ID --config wrangler.assistente.jsonc\n    npx wrangler secret put ASSISTENTE_OAUTH_PASSWORD --config wrangler.assistente.jsonc

Cada ambiente precisa de seu próprio OAuth App GitHub, porque o GitHub OAuth App registra um callback por aplicação. Para preview, configure callback com o domínio workers.dev do Worker de preview; para produção, use o domínio assistente.joaolds.xyz.br. Configure a chave de criptografia antes de iniciar qualquer consentimento; rotacioná-la exige reconectar os provedores.

## Operação

Depois que o código estiver implantado no ambiente autorizado e os secrets estiverem configurados, acesse /connections/github/start e /connections/cloudflare/start, entre com a senha do Assistente e conclua o consentimento em cada provedor. assistente_status confirma o estado sem revelar tokens. A conexão Cloudflare é a usada pelas skills Ponto e Gastos.

## Limites e aceite pendente

- Este Worker tem um único operador; tokens upstream são guardados por provedor, não por usuário final. Para um serviço multiusuário, é necessário separar tokens por identidade OAuth e aplicar autorização por usuário.
- CI usa provedores simulados. Ainda falta registrar/configurar o OAuth App GitHub, adicionar secrets no Worker, autorizar as duas contas, realizar uma leitura real segura de cada MCP, testar refresh/revogação no ambiente de preview e revisar o deploy. Não executar escrita de teste nem alterar D1.
- A branch não deve ser promovida a produção até a validação acima. A versão ativa e os bancos D1 não foram alterados.
