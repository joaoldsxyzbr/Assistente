# Assistente

O Assistente é o hub técnico que conecta o plugin **Assistente Geral** a vários MCPs. O plugin continua sendo a entrada do usuário no ChatGPT e a fonte das skills e regras conversacionais. Este repositório mantém o Worker host e um módulo por MCP conectado.

## Responsabilidades

- **Assistente Geral (plugin):** skills, regras de domínio, interpretação da intenção e orientação sobre o fluxo de conversa.
- **Assistente (host):** autentica a entrada, publica apenas ferramentas aprovadas e encaminha chamadas a MCPs de destino.
- **Módulo em src/mcps/<nome>:** mantém o contrato e a integração específica de um MCP, isolados dos demais.
- **MCP de destino:** valida suas operações e acessa os recursos autorizados pelo token próprio.

Ponto e Gastos não fazem parte deste repositório. Suas regras continuam no plugin Assistente Geral; este projeto não hospeda Workers de Ponto/Gastos nem se conecta aos seus D1s.

## Estrutura atual

| Parte | Responsabilidade |
|---|---|
| Worker assistente | Endpoint MCP único para o ChatGPT e roteador dos MCPs conectados |
| src/mcps/cloudflare/ | Contratos das ferramentas do Cloudflare MCP |
| Cloudflare MCP | Integração inicial; ferramentas aprovadas: documentação, busca OpenAPI e execução da API Cloudflare |
| Futuras pastas em src/mcps/ | Um módulo isolado por MCP adicional, após definir ferramentas e permissões |

As pastas são módulos do hub, não Workers implantados individualmente. A primeira etapa tem apenas o Worker host assistente. A integração Cloudflare não ganha acesso por estar configurada: o host só expõe os contratos locais.

## Autenticação

- ChatGPT → Worker: OAuth 2.1 com authorization code, PKCE, descoberta, Client ID Metadata Documents e registro dinâmico de clientes.
- A autorização do usuário é protegida por senha, armazenada como secret no Worker. O consentimento do navegador é vinculado por handle de uso único.
- O Worker anuncia offline_access e emite refresh tokens para manter a conexão.
- O escopo mcp:read é necessário para chamadas básicas. O escopo mcp:write é exigido para a ferramenta execute, que pode alterar recursos.
- Worker → Cloudflare MCP: o API Token Assistente Cloudflare é enviado como bearer no secret MCP_CLOUDFLARE_TOKEN.
- O endpoint não secreto https://mcp.cloudflare.com/mcp fica configurado em wrangler.assistente.jsonc.

As credenciais têm finalidades diferentes. O API Token Cloudflare não autentica o ChatGPT. Ele limita o que o Cloudflare MCP pode fazer conforme as permissões concedidas ao token.

## Estado e configuração

O Worker assistente está conectado ao domínio assistente.joaolds.xyz.br. O código implementa OAuth e o binding OAUTH_KV aponta para o namespace dedicado assistente-oauth. Antes de ativar a nova versão, configure a senha OAuth:

    npx wrangler secret put ASSISTENTE_OAUTH_PASSWORD --config wrangler.assistente.jsonc

Use uma senha aleatória com pelo menos 32 bytes. Não reutilize o API Token Cloudflare nem compartilhe a senha. Ela não entra no Git; fica somente nos secrets do Worker. O equivalente no painel é Workers & Pages → assistente → Settings → Variables and Secrets → Add secret.

Depois de configurar a senha, a nova versão pode ser ativada com:

    npx wrangler deploy --config wrangler.assistente.jsonc

No ChatGPT, configure o endpoint:

    https://assistente.joaolds.xyz.br/mcp

Selecione OAuth. Se o conector já foi criado antes da atualização dos metadados, recrie-o para buscar a configuração atual.

## Cloudflare Workers Builds

O Worker conectado ao GitHub se chama assistente. Configure o diretório raiz como /, deixe o build command vazio e use npx wrangler versions upload --config wrangler.assistente.jsonc como deploy command. Isso envia uma versão sem ativá-la em produção. Para ativar, use o comando de deploy acima depois de configurar a senha e validar OAuth.

## Requisitos e verificações

- Node.js 24 ou superior.
- npm.

    npm install
    npm run check

O comando check executa typecheck, testes e build dry-run do Worker host.
