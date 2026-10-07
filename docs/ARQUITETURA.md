# Arquitetura do Assistente

## Objetivo

Este repositório implementa um hub MCP para o plugin Assistente Geral. O plugin mantém as skills e regras conversacionais; o Worker host agrega os contratos dos MCPs conectados e roteia cada chamada ao destino certo.

A estrutura recomendada é **um módulo por MCP em src/mcps/<nome> e um único Worker host**. Cada módulo isola contrato, schema, credenciais e integração. Os diretórios não são implantados como Workers separados.

## Responsabilidades

| Camada | O que contém |
|---|---|
| Plugin Assistente Geral | Skills e regras de domínio/conversa, roteamento por intenção e apresentação dos resultados. É a fonte canônica dessas instruções e vive fora deste repositório. |
| Worker host assistente | Endpoint MCP único, autenticação OAuth, catálogo allowlist e roteamento para os módulos MCP. Não tem acesso direto a APIs de domínio nem a D1. |
| src/mcps/cloudflare/ | Contratos das ferramentas aprovadas para a integração Cloudflare. Novos MCPs recebem pastas próprias. |
| MCP de destino | Validação técnica da chamada, autenticação no serviço e aplicação das permissões do token. |

Regras conversacionais não são copiadas para o Worker. Proteções que precisam funcionar mesmo fora do chat — schema, allowlist, validação e autorização no serviço — continuam aplicadas pelo código e pelo MCP de destino.

## Escopo atual

- Incluído: um Worker assistente e o conector ao Cloudflare MCP.
- Fora deste repositório: servidores e acesso a dados de Ponto e Gastos. As skills e regras continuam no plugin Assistente Geral; os D1 existentes não são alterados.
- Futuro: outros MCPs podem ser adicionados em pastas próprias, com contrato, endpoint e credencial independentes.

O catálogo inicial do Cloudflare MCP expõe três ferramentas: docs, search e execute. O host não expõe ferramentas remotas descobertas dinamicamente; cada ferramenta precisa estar declarada no contrato local.

## Autenticação e autorização

| Origem → destino | Credencial | Regra |
|---|---|---|
| ChatGPT → Worker | OAuth 2.1 com authorization code + PKCE | Metadados de descoberta, Client ID Metadata Documents, registro dinâmico, offline_access e refresh tokens |
| Navegador → consentimento | Senha do proprietário em secret ASSISTENTE_OAUTH_PASSWORD | Handle de uso único protege o consentimento contra CSRF; conteúdo do cliente é escapado |
| Worker → Cloudflare MCP | API Token Cloudflare em MCP_CLOUDFLARE_TOKEN | Bearer separado do OAuth do ChatGPT |
| Cloudflare MCP → Cloudflare API | API Token Assistente Cloudflare | O token limita operações aos recursos e permissões que o proprietário concedeu |

O host publica mcp:read como escopo básico. A ferramenta execute exige também mcp:write e recebe desafio OAuth de insufficient_scope quando o token não possui essa permissão.

O token do ChatGPT não é encaminhado ao MCP remoto. O API Token Cloudflare não autentica o ChatGPT nem substitui o OAuth da conexão com o Worker.

### Transação de consentimento

No `GET /authorize`, o pedido OAuth é validado por `parseAuthRequest` e armazenado por `beginConsent` no `OAUTH_KV` como uma transação de curta duração, vinculada a um cookie `__Host-*` do navegador. O formulário envia apenas o `handle`, a decisão e a senha para `POST /authorize`.

No `POST /authorize`, o Worker **não** reinterpreta a query OAuth. `approveConsent` reabre a transação usando o `handle` e o cookie, recupera o pedido original e a consome uma única vez; `completeAuthorization` conclui o authorization code flow. Assim, a autorização não depende de o navegador preservar `client_id`, `redirect_uri`, `state`, PKCE ou outros parâmetros na URL do POST.

Falhas esperadas do consentimento registram somente etapa, categoria, código do erro e status HTTP. Para depuração de fronteira, o Worker também grava no `OAUTH_KV` marcadores de curta duração sob `diagnostic:oauth:*`, contendo somente etapa, horário, status HTTP e, em respostas OAuth de erro, um código simples validado. Esses marcadores nunca armazenam corpo da requisição, corpo de resposta bem-sucedida, parâmetros OAuth, headers, authorization code, verifier, assertion, cookie ou token. O Worker também usa o `onError` da biblioteca OAuth para registrar apenas a categoria e o motivo estáveis das falhas do token endpoint. Workers Logs fica habilitado para permitir diagnóstico do fluxo real, com `redact_query_string` ativo e invocation logs desativados; somente os eventos estruturados emitidos pelo código são necessários para o diagnóstico. Senhas, tokens, cookies, authorization codes, query strings, descrições com dados do pedido e credenciais não entram nos logs.


## Segurança e limites

- O host aceita somente endpoint HTTPS sem credenciais na URL, query string ou fragmento.
- O catálogo local é allowlist; configurar um MCP não publica automaticamente qualquer ferramenta.
- Chamadas são encaminhadas a um único MCP. O host não fornece execução genérica de código além do que o MCP Cloudflare já expõe, nem tenta novamente uma chamada que possa ter escrito.
- Erros remotos não revelam URL, token ou exceção interna.
- Nenhum Worker deste repositório tem binding D1.
- Nenhum código ou configuração deste repositório lê, cria ou migra os D1 de Ponto e Gastos.
- O OAuth grava clientes, transações de consentimento, códigos e tokens apenas no KV dedicado assistente-oauth.

## Deploy

O domínio assistente.joaolds.xyz.br aponta para o Worker assistente. O endpoint MCP é https://assistente.joaolds.xyz.br/mcp. O binding OAUTH_KV e o endpoint Cloudflare MCP estão definidos em wrangler.assistente.jsonc. A senha OAuth deve ser criada como secret fora do Git antes de ativar a versão.

O comando npm run build:workers valida o bundle em dry-run sem publicar.

## Organização do código

| Caminho | Responsabilidade |
|---|---|
| src/host/ | Endpoint, roteamento e montagem das ferramentas |
| src/mcps/contracts.ts | Contrato comum dos módulos MCP |
| src/mcps/catalog.ts | Catálogo agregado que o host expõe |
| src/mcps/cloudflare/ | Schemas e ferramentas do Cloudflare MCP |
| src/shared/oauth-authorization.ts | Fluxo HTTP de autorização, consentimento, diagnóstico seguro e conclusão OAuth |
| src/shared/oauth-mcp-worker.ts | Montagem do OAuthProvider e proteção/autorização das chamadas MCP |
| tests/ | Testes sintéticos do host e dos contratos |


### Concorrência no consentimento OAuth

O endpoint `POST /authorize` é protegido contra submissões concorrentes da mesma transação antes de entrar no `OAuthProvider`. O host usa o handle opaco somente para derivar o nome esperado do cookie `__Host-oauth-consent-*` (SHA-256, mesmo esquema do upstream) e confirma que esse cookie existe na requisição; o valor do cookie, a senha e os demais campos não entram na chave nem são persistidos. As submissões da mesma transação são coalescidas por uma janela curta em memória. Isso preserva a semântica single-use de `approveConsent()`: apenas uma execução consome a transação, enquanto uma segunda submissão concorrente recebe um clone da mesma resposta 3xx. Respostas não-3xx e exceções não ficam retidas.
