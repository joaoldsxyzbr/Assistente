# Plano — logs de auditoria MCP (22/10/2026)

Objetivo: diagnosticar falhas intermitentes sem novo banco, painel, SDK nem alterações OAuth.
1. Um evento tool_execution por invocação, com etapa, resultado, categoria, duração, traceId e operação de escrita.
2. Etapas: validation, oauth, connection, upstream, normalization, preview; classificadores e nomes fixos, sem ler dados remotos para logs.
3. Cobrir 25 ferramentas, preservando resposta HTTP/SSE e logs anteriores.
4. Testes de timeout, erro OAuth, isError upstream, preview, escrita incerta e confidencialidade.
5. CI Node/Chromium/Workerd; merge pela PR somente após aprovação; deploy Worker é verificação separada.

Privacidade: não coletar argumentos, mensagens de exceção, caminhos, SQL, parâmetros, corpos, tokens, emails ou dados bancários.
Em falha após envio de escrita upstream, marcar uncertain:true e exigir verificação manual antes de repetição.