# Arquitetura do Assistente MCPs

ChatGPT conecta-se por OAuth ao único Worker Assistente MCPs. O Worker hospeda as três skills e encaminha chamadas aos MCPs oficiais por HTTPS:

- GitHub oficial: https://api.githubcopilot.com/mcp/x/all
- Cloudflare oficial: https://mcp.cloudflare.com/mcp
- Skills locais: Ponto, Gastos e Desenvolvimento

## Implementação

- JavaScript nativo (ES Modules) e SDKs MCP oficiais.
- mcp_github_tools e mcp_cloudflare_tools consultam os catálogos oficiais em tempo real. mcp_github_call e mcp_cloudflare_call encaminham nomes e argumentos ao servidor original; o Worker não copia nem redefine cada ferramenta.
- OAuth do ChatGPT e OAuth upstream são independentes. O Worker descobre os metadados do provedor, usa PKCE e armazena access/refresh tokens cifrados em KV.
- GitHub usa o MCP remoto oficial com toolset all; a autorização continua limitada à conta, permissões e escopos concedidos ao OAuth App.
- A identidade upstream neste Worker é de operador único, compatível com o userId=owner do OAuth do Assistente. Não compartilhar a senha do Worker nem o endpoint com outros usuários.
- Ferramentas genéricas de chamada remota exigem mcp:write, pois o Worker não pode presumir que cada ferramenta remota seja somente leitura. Escritas incertas não são repetidas automaticamente.
- Ponto e Gastos chamam as ferramentas D1 oferecidas pelo MCP oficial Cloudflare e usam IDs canônicos separados. O Worker não tem binding D1.

## Proteções e validação

- Hosts upstream são fixos; endpoints OAuth descobertos são aceitos apenas nos domínios oficiais de cada provedor e redirecionamentos HTTP são recusados.
- Estado OAuth de uso único, PKCE S256, CSP, validação de origem dos formulários e criptografia AES-GCM para registros em KV.
- CI cobre discovery, DCR Cloudflare, PKCE, cifragem, renovação e revogação GitHub com respostas simuladas; o build dry-run verifica os ambientes de produção e preview. Isso não comprova consentimento ou chamadas reais aos provedores.
- Merge e deploy de produção continuam bloqueados até credenciais, consentimentos, preview seguro e validação ponta a ponta. D1 e produção permanecem intactos.
