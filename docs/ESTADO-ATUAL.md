# Estado atual — Assistente MCPs (21/10/2026)

## Fonte de verdade
- Repositório `joaoldsxyzbr/Assistente`, branch `main` (fonte de verdade após integração desta limpeza).
- Um Worker Cloudflare `assistente`, endpoint `https://assistente.joaolds.xyz.br/mcp`.
- Ponte OAuth aos MCPs **oficiais** GitHub e Cloudflare; JavaScript ES Modules; sem Preview ou binding D1.
- As skills locais de ponto, gastos e desenvolvimento foram removidas anteriormente por decisão do usuário, no PR #94. Em 21/10, também se retirou o pacote `plugin/`, testes de skills e geração de ZIP. Este repositório mantém apenas MCPs e infraestrutura relacionada; não reintroduzir `assistente_skill`.

## Catálogo MCP atual
Exatamente sete ferramentas:
`assistente_status`, `mcp_github_tools`, `mcp_github_call`, `mcp_cloudflare_tools`, `mcp_cloudflare_call`, `github_relocate_directory` e `github_edit_file`.

Ao aparecer `Tool assistente_skill not found`, há defasagem no catálogo do cliente ChatGPT ou Vibe Work, não necessidade de restaurar a ferramenta. Atualizar/reconectar **Assistente MCPs** no cliente para obter novamente o catálogo. Upload ou promoção do Worker não garante atualização automática do catálogo em sessões existentes.

## Desenvolvimento e implantação
1. Trabalhar em branch e abrir PR. Validar `checks` (CI: sintaxe, testes Node, browser Chromium, Workerd e build dry-run).
2. `npm run test:runtime` utiliza o pacote compilado por `wrangler deploy --dry-run --outdir`; `esbuild` não é dependência direta, mas continua transitiva via Wrangler.
3. Após merge e upload da versão Cloudflare, promover explicitamente, confirmar 100% do tráfego e validar chamadas reais de **leitura** aos dois MCPs.
4. Não usar D1 pessoal em testes nem alterar escopos, segredos ou autenticação sem necessidade.
5. `dependency-security.yml` audita dependências semanalmente; consultar o lockfile e as políticas antes de atualizações.

## Manutenção
- Registros em `docs/*-2026-10-*.md` são históricos: podem mencionar skills, Preview e integrações aposentadas; **este documento e o README descrevem o estado vigente**.
- PRs e branches antigas de arquitetura anterior não devem ser mesclados sem comparação com a `main`.
- Limpeza de branches via workflow manual `cleanup-merged-branches.yml` (primeiro `apply=false`, depois `apply=true` se a prévia estiver adequada). O script `scripts/cleanup-merged-branches.mjs` verifica PR mesclado, SHA igual e ausência de PR aberto. Branches não mescladas ou com commits novos são preservadas e o histórico permanece no Git.
- Proteger `main` contra exclusão e force-push; exigir PR e o status do CI, conforme suporte e permissões do GitHub.