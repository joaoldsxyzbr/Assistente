# Arquitetura do Assistente MCPs

ChatGPT conecta-se por OAuth ao único Worker Assistente MCPs. O Worker hospeda as três skills e encaminha chamadas aos MCPs oficiais por HTTPS:

- GitHub oficial: https://api.githubcopilot.com/mcp/x/all
- Cloudflare oficial: https://mcp.cloudflare.com/mcp
- Skills locais: Ponto, Gastos e Desenvolvimento

## Implementação

- JavaScript nativo (ES Modules) e SDKs MCP oficiais.
- `mcps/github/` e `mcps/cloudflare/` guardam os endpoints, domínios permitidos e etapas OAuth específicas; `server/` contém a ponte e a lógica compartilhada.
- mcp_github_tools e mcp_cloudflare_tools consultam os catálogos oficiais em tempo real. mcp_github_call e mcp_cloudflare_call encaminham nomes e argumentos ao servidor original; o Worker não copia nem redefine cada ferramenta.
- OAuth do ChatGPT e OAuth upstream são independentes. O Worker descobre os metadados do provedor, usa PKCE e armazena access/refresh tokens cifrados em KV.
- GitHub usa o MCP remoto oficial com toolset all; a autorização continua limitada à conta, permissões e escopos concedidos ao OAuth App.
- A identidade upstream neste Worker é de operador único, compatível com o userId=owner do OAuth do Assistente. Não compartilhar a senha do Worker nem o endpoint com outros usuários.
- Ferramentas genéricas de chamada remota exigem mcp:write, pois o Worker não pode presumir que cada ferramenta remota seja somente leitura. Escritas incertas não são repetidas automaticamente.
- Ponto e Gastos chamam as ferramentas D1 oferecidas pelo MCP oficial Cloudflare e usam IDs canônicos separados. O Worker não tem binding D1.

## Proteções e validação

- Hosts upstream são fixos; endpoints OAuth descobertos são aceitos apenas nos domínios oficiais de cada provedor e redirecionamentos HTTP são recusados.
- Estado OAuth com validade explícita e remoção no callback, validação de issuer, PKCE S256, CSP compatível com redirecionamento oficial, validação de origem e criptografia AES-GCM para registros em KV. Os limites de concorrência do KV estão em OAUTH-UPSTREAM.md.
- CI cobre discovery, DCR Cloudflare, PKCE, cifragem, renovação e revogação GitHub com respostas simuladas; o build dry-run verifica a configuração de produção. Isso não comprova consentimento ou chamadas reais aos provedores.
- O Worker está publicado e suas credenciais configuradas. Consentimento e chamadas reais dependem do operador; o aceite ponta a ponta permanece pendente até confirmar leituras, refresh e revogação reais. Não fazer escritas de teste em D1.
- Chromium cobre a regressão do clique bloqueado por CSP, o redirecionamento GET para ambos os provedores e a apresentação de erro de senha. As referências das skills são servidas pelo MCP em `assistente_skill` com `arquivo`.


## Contrato de saída textual do proxy

\`mcp_github_call\` e \`mcp_cloudflare_call\` normalizam o retorno dos provedores para blocos MCP \`content\` do tipo \`text\` exclusivamente. Textos pequenos são preservados. Resultados \`structuredContent\` são serializados em JSON textual somente se o provedor não fornecer texto; \`_meta\` é descartado. Recursos textuais embutidos viram texto; links HTTPS sem query podem ser indicados como referência; imagens, áudio e dados binários não são encaminhados.

O limite de resposta normalizada é 64 KiB. Respostas maiores são recusadas com instrução para restringir a consulta, sem truncar silenciosamente. Erros de upstream conservam \`isError\`; chamadas de escrita incertas não são repetidas. A saída apenas textual reduz o risco de anexos emitidos pelo Worker, mas a apresentação/materialização feita pela plataforma ChatGPT é externa ao Worker e depende de verificação prática.

A normalização não altera OAuth, endpoints ou autorização. Para valores estruturados, nenhum dado remoto de recurso/binário deve ser tratado como conteúdo executável. Veja os testes em \`tests/remote-tools.test.js\`.

## Robustez incremental (17/10/2026)

Corpos remotos recebem limite de 2 MiB por stream **antes** do parse; saídas ao ChatGPT continuam limitadas a 64 KiB. A descoberta de ferramentas agora é resumida e paginada por padrão; o schema integral é recuperado com `name`, sem copiar as ferramentas para o Worker. O cliente MCP negocia automaticamente protocolos modernos e legados. Os bindings nativos de rate limiting mantêm as cotas de produção, e o proxy registra duração/resultado sem parâmetros nem tokens. Veja [ROBUSTEZ-2026-10-17.md](./ROBUSTEZ-2026-10-17.md) para comportamento, validação e rollback.

## Simplificação operacional (19/10/2026)

O projeto mantém somente o Worker de produção: CI e build dry-run antes de publicar, promoção explícita da versão validada e rollback pela Cloudflare. O gatilho de Preview foi removido, e as configurações `env.preview` e `previews` foram retiradas do Wrangler. Veja [LIMPEZA-2026-10-19.md](./LIMPEZA-2026-10-19.md). Registros históricos anteriores de Preview descrevem o estado na época, não uma obrigação atual.
