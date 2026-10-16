# Arquitetura do Assistente MCPs

```text
ChatGPT ──OAuth próprio──> Worker Assistente MCPs
                             ├── MCP GitHub oficial (OAuth independente)
                             ├── MCP Cloudflare oficial (OAuth independente)
                             └── Skills Markdown: ponto, gastos, desenvolvimento
```

## Implementação atual (branch de evolução)

- Worker usa SDK MCP com JavaScript puro; OAuthProvider preserva autenticação do cliente ChatGPT.
- Ponte MCP HTTPS usa `@modelcontextprotocol/client`, hosts permitidos fixos e token upstream separado por provedor.
- `mcp_github_tools` e `mcp_cloudflare_tools` listam ferramentas no servidor original; `mcp_github_call` e `mcp_cloudflare_call` executam operações identificadas.
- Para reduzir risco, chamadas remotas exigem escopos do Worker `mcp:read` e `mcp:write`, mesmo operações de leitura. Isso é provisório; implementar autorização refinada antes de produção.
- Os tokens upstream ainda não têm aquisição, renovação ou revogação automáticas. Nenhum token do ChatGPT é encaminhado ao provedor.

## Regras

- Não expor token em respostas ou logs e não aceitar endpoints arbitrários.
- Não aceitar escrita D1 sem conta/banco canônico, permissão e pedido autorizado.
- Não repetir escrita incerta; conferir o serviço primeiro.
- Usar somente `joaoldsxyzbr/Assistente-mcps` neste projeto.

**Bloqueadores para produção:** conferir [OAuth upstream](OAUTH-UPSTREAM.md), implementação de fluxo de consentimento e gerenciamento de tokens, allowlist granular, testes de integração seguros.
