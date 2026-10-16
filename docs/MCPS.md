# MCPs do Assistente

## Arquitetura

O ChatGPT conecta-se a um único servidor MCP: o Worker Assistente MCPs. Esse Worker oferece as skills locais e encaminha as chamadas aos MCPs oficiais do GitHub e da Cloudflare.

`ChatGPT → Assistente MCPs (Worker) → MCP oficial GitHub / MCP oficial Cloudflare + skills`

- **GitHub**: `mcps/github/` configura o endpoint oficial, os domínios permitidos e o OAuth específico do provedor.
- **Cloudflare**: `mcps/cloudflare/` configura o endpoint oficial, os domínios permitidos e o OAuth específico do provedor.
- **Skills locais**: `skills/` contém Ponto, Gastos e Desenvolvimento. Ponto e Gastos usam as ferramentas do MCP Cloudflare conforme suas instruções.

O Worker descobre as ferramentas remotas e as encaminha. Ele não duplica as ferramentas oficiais.

## Autenticação

Há dois trechos OAuth independentes: ChatGPT → Assistente MCPs e Assistente MCPs → cada provedor. O token do ChatGPT não é repassado ao GitHub nem à Cloudflare. O Worker guarda tokens dos provedores cifrados no KV.

O GitHub usa o OAuth App configurado para o projeto. A Cloudflare usa o fluxo oficial de OAuth com registro dinâmico de cliente. As permissões efetivas continuam limitadas ao consentimento dado em cada provedor.

## Estado e validação

O código, os testes simulados e o build dry-run estão na `main`. Isso valida a implementação local, mas não comprova login ou chamadas reais aos provedores.

O Worker de produção está publicado e suas credenciais configuradas. Ainda é necessário concluir o consentimento GitHub/Cloudflare e confirmar leituras reais. O preview tem KV e credenciais próprios. Os testes automatizados incluem protocolo MCP, referências das skills e clique em Chromium com provedores simulados; não fazem escritas nos bancos D1 pessoais.
