# Fechamento de auditoria — 20/10/2026

Repositório canônico: `joaoldsxyzbr/Assistente-mcps`.

## Decisão preservada
A remoção das skills locais ponto, gastos e desenvolvimento foi solicitada pelo usuário e efetuada no PR [#94](https://github.com/joaoldsxyzbr/Assistente-mcps/pull/94). **Não reintroduzir** skills nem `assistente_skill`. O Worker permanece uma ponte OAuth para os MCPs oficiais GitHub e Cloudflare, com sete ferramentas.

## Ajustes executados e evidências
1. [PR #95](https://github.com/joaoldsxyzbr/Assistente-mcps/pull/95), merge `be34486303fa03f6120b385d234fd88525f92437`: testes Workerd utilizam bundle gerado por Wrangler, e dependência `esbuild` foi retirada do `package.json`; README, política e estado atual registrados. [CI da main aprovado](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39502645116).
2. [PR #68](https://github.com/joaoldsxyzbr/Assistente-mcps/pull/68) encerrado como obsoleto: alterava arquitetura anterior de ponto/gastos/TypeScript. Não mesclar sem nova análise.
3. Ruleset GitHub **25508122**, `Proteção da main — PR e CI`: exige pull request e status `checks` atualizado; impede deleção e force-push. Verificado via API de regras para `main` e `protected=true`.
4. [PR #96](https://github.com/joaoldsxyzbr/Assistente-mcps/pull/96), merge `d513f7b8f18a62f6361e012c76c45dce0f4f1481`: script `scripts/cleanup-merged-branches.mjs` e workflow manual `cleanup-merged-branches.yml`; [CI da main aprovado](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39503404963).
5. [Diagnóstico de branches](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39503433531): 35 branches existentes, 32 candidatas, 3 preservadas.
6. [Execução da limpeza](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39503519716): 32 branches de PRs mesclados excluídas após comparação e rechecagem de SHA. Histórico dos PRs preservado.
7. Cloudflare Worker `assistente`: versão **110** (`c5679fbf-12f2-40df-a80c-6dd0adfafe3a`) promovida e confirmada atendendo **100%** do tráfego. As conexões upstream GitHub e Cloudflare constavam operacionais em `assistente_status`.

## Branches restantes após a limpeza
- `main` — protegida.
- `feat/oauth-oficial-sem-tokens-20261016` (`69cf1834f9a0e0b14cc8937e2135d13e610be719`) — sem correspondência a PR mesclado e SHA atual; preservada por precaução.
- `fix/audit-67-hardening-20261013` (`9d4ebf71d55d58a801da6e45233509b7cbed5840`) — PR #68 foi encerrado **sem merge**; preservada por precaução.

## Limites e observações
- Remover `esbuild` como dependência direta **não** elimina o `esbuild` transitivo do Wrangler. O `package-lock.json` mantém a árvore transitiva; `npm ci` e CI passaram.
- Algumas entradas antigas de GitHub Actions podem continuar aparecendo na lista de workflows históricos, mesmo após exclusão dos respectivos arquivos da `main`. Apenas três arquivos de workflow estão versionados agora.
- Sessões antigas do ChatGPT podem exibir `assistente_skill` no catálogo em cache e retornar `Tool not found`; atualizar/reconectar o app **Assistente MCPs** no cliente. O servidor não tem controle sobre o cache do cliente.
- Não foram realizados testes artificiais de escrita nos bancos D1, nem alteradas as credenciais OAuth. Reautorização completa no cliente requer interação do usuário.

## Política contínua
Manter código JavaScript nativo, APIs oficiais, ferramentas necessárias e documentação objetiva. Usar o CI e PRs na `main`, validar Cloudflare após merges e não apagar branches com trabalho único sem verificação.
