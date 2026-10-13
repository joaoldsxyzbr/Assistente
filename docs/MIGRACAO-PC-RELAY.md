# Migração de encerramento do Durable Object PcRelay (13/10/2026)

## Causa e escopo

O Worker de produção ainda possui o namespace `PcRelay` do antigo controle remoto do PC (que foi descontinuado e retirado na PR #63). O deploy da versão limpa falha com **Cloudflare 10064** porque o código deixou de exportar a classe enquanto o namespace continua provisionado.

Somente o namespace/armazenamento **PcRelay** será permanentemente excluído. **Não** apagar o Worker `assistente`, o KV `OAUTH_KV`, os D1 de ponto e gastos, os secrets de OAuth/Cloudflare/GitHub ou o domínio personalizado.

Referência: https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/

## Execução confirmada em produção

- **PR:** #64, commit `0dfa9ef2d6f2d28ca98c7f00ae4d01b668c18951`.
- **Worker:** `assistente`, versão `89d9deb1-341b-447c-8c91-33c36c4676c0` implantada em 13/10/2026 às 12:56:37 UTC com 100% do tráfego.
- **Evidência Cloudflare Builds:** `Durable Object exports reconciliation: Deleted: PcRelay`; `Success: Deploy command completed` e `Success! Build completed.`
- **Verificações:** `assistente_status` retornou Cloudflare configurado com três ferramentas e GitHub com 21; leitura de identificação GitHub passou; GitHub CI da `main` aprovado (run 38401029157).
- **Etapa de encerramento:** remoção do tombstone e restabelecimento de `wrangler versions upload` na branch `main`. Dados anteriores do PcRelay foram definitivamente eliminados.

## Procedimento executado (referência histórica)

1. Verifique `main`, `npm run check` e o SHA do commit da migração. Garanta que a configuração não possui binding de `PcRelay`, que a classe não é exportada pelo Worker e que há somente `exports.PcRelay = { type: "durable-object", state: "deleted" }`.
2. Na Cloudflare > Workers & Pages > `assistente` > Settings > Builds, **temporariamente** altere o comando de deploy da branch **main** de `npx wrangler versions upload --config wrangler.assistente.jsonc` para:
   
   ```bash
   npx wrangler deploy --config wrangler.assistente.jsonc
   ```
   
   Alternativamente, com credencial Cloudflare devidamente autorizada, execute essa mesma instrução na cópia da **main** já validada. Não execute `versions upload` enquanto existir tombstone.
3. Após o CI GitHub aprovado, faça **um** deploy da versão da migração. `wrangler deploy` **publica diretamente em produção**; não há promoção posterior manual nesse primeiro deploy. Verifique o resultado da migração: namespace `PcRelay` excluído. A deleção é **irreversível** e não se pode efetuar rollback para a versão anterior que ainda exportava essa classe.
4. Confirme que `assistente.joaolds.xyz.br/mcp` segue autenticando normalmente, que `assistente_status` mostra Cloudflare e GitHub, e que as ferramentas de ponto/gastos permanecem declaradas. Faça somente leituras leves; não gere batidas ou lançamentos de teste nos bancos reais.
5. **Depois de confirmar a exclusão**, em PR separado remova o tombstone `exports.PcRelay` do Wrangler (quando ele já estiver stale / removível); retorne o comando de build para `npx wrangler versions upload --config wrangler.assistente.jsonc` e preserve o fluxo normal de versões não promovidas automaticamente.
6. Confira ausência de `PcRelay` e `pc_*` na nova versão; mantenha registro em Issue #52 e no histórico do GitHub.

## Notas de diagnóstico

- `enable_ctx_exports` ausente da configuração nova é esperado: foi removido junto do agente PC.
- Avisos npm `allow-scripts` não causam o erro 10064.
- Nunca usar `migrations.deleted_classes` juntamente com `exports` no mesmo Worker. A migração deste Worker é gerenciada por **`exports`**, não por `migrations`.
- Uma falha de build não deve motivar restaurar o agente `PcRelay` ou apagar todo o Worker.
- O secret aposentado `PC_AGENT_TOKEN` deve ser excluído separadamente no painel, se ainda presente, sem afetar os secrets ativos.

## Critérios de aceite

- CI `main` verde e migração `PcRelay` aplicada pela Cloudflare.
- Worker `assistente` no domínio original, endpoint MCP e OAuth operacionais.
- Cloudflare/GitHub conectados, ponto/gastos preservados e nenhuma ferramenta do PC exposta.
- Comando normal de build restaurado para `versions upload` em segunda etapa.
