# Integração com os MCPs oficiais

## Arquitetura escolhida

O Assistente MCPs é o único MCP conectado ao ChatGPT. Ele hospeda as skills Ponto, Gastos e Desenvolvimento e encaminha chamadas aos servidores oficiais do GitHub e da Cloudflare.

`ChatGPT → Assistente MCPs (Worker) → MCPs oficiais GitHub e Cloudflare + skills locais`

O Worker usa OAuth próprio na conexão com o ChatGPT e mantém um fluxo OAuth separado para cada provedor. Ele não repassa o token do ChatGPT aos servidores upstream.

## Implementado na main

- Adaptadores separados em `mcps/github/` e `mcps/cloudflare/`.
- Descoberta e encaminhamento dinâmico de ferramentas dos MCPs oficiais.
- Fluxos OAuth upstream com PKCE, validação de domínios, armazenamento cifrado em KV e suporte a renovação/revogação quando oferecidos pelos provedores.
- Skills e testes automatizados para OAuth, roteamento remoto e catálogo de skills.

## Validação pendente no ambiente

A integração foi mesclada na `main` e a CI passou com provedores simulados e build dry-run. Isso não comprova consentimento OAuth nem chamadas reais aos provedores.

O Worker de produção já foi publicado e suas credenciais estão configuradas. A validação ponta a ponta depende de autorizar as contas GitHub/Cloudflare e confirmar leituras, renovação e revogação. Os testes de navegador simulam os provedores e não substituem o consentimento real. Os bancos D1 pessoais não são usados para escritas de teste. Veja AUDITORIA-2026-10-16.md.
