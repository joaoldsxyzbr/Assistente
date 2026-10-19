# Copia e movimentacao GitHub sem payload — 19/10/2026

## Motivacao
Na reorganizacao de pastas, copiar arquivos com `push_files` obriga o ChatGPT a reenviar o texto integral de cada arquivo. Isso consome contexto, aumenta requisicoes e pode falhar antes de chegar ao Worker. Logs da versao `2ed2b7e4` mostram dezenas de lotes bem-sucedidos (ate 8 arquivos e mais de 50 KiB), apesar de relatos de instabilidade no cliente. A causa externa exata nao foi comprovada.

## Solucao
A ferramenta `github_relocate_directory` usa **GitHub REST Git Database**, com o mesmo token OAuth do GitHub ja conectado ao Assistente, sem segredo novo ou upload de conteudo. O `mcp_github_call` oficial permanece intacto para edicoes e demais ferramentas.

Fluxo do GitHub: ler ref da branch, commit e arvore; referenciar os SHA dos blobs; criar uma nova arvore e um commit; atualizar o ref sem `force`. O codigo original nao trafega pelo ChatGPT/Worker. Copia e movimentacao preservam modos de arquivos. Alteracoes de imports **nao** sao feitas automaticamente.

### Operacao segura
1. Em branch de trabalho, chamar `github_relocate_directory` com `owner`, `repo`, `branch`, `from`, `to`, `mode: "copy"` ou `"move"` e `dryRun: true` (padrao). Receber plano e `headSha` atual.
2. Conferir origem, destino, contagem e eventuais arquivos identicos ja copiados.
3. Executar somente com `dryRun: false`, `expectedHeadSha` da previa e mensagem de commit. Escrita em `main` e `master` e bloqueada. Nao ha repeticao automatica.
4. Conferir o commit e os arquivos na branch. Ajustar imports de forma independente com `push_files` pequeno. Executar testes antes do merge.
5. Se a gravacao tiver resultado incerto, **verificar a branch no GitHub antes de repetir**.

### Protecoes
- Nao copia se houver arquivo de destino com SHA/modo diferentes, nem move submodulos.
- Ja existentes com SHA/modo identicos sao reconhecidos e nao regravados.
- Uma operacao contem no maximo 250 arquivos e nao aceita arvores GitHub truncadas.
- `move` copia e remove originais **no mesmo commit**, sem deletar antes de garantir a arvore destino.
- Recusa paths com `..`, sobreposicao de origem/destino e branch de producao para escrita.
- `expectedHeadSha` obrigatorio; atualizacao de ref sem `force` protege contra concorrencia.
- Logs registram apenas categoria, quantidade, duracao e traceId, nao os nomes de arquivos, codigo ou token.

## Referencia oficial
https://docs.github.com/en/rest/git/trees
https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database

## Validacao
`npm run check`, `npm run test:browser` e `npm run test:runtime`, com testes unitarios para previa, idempotencia, conflitos, SHA, concorrencia, copia/movimentacao e rejeicoes. Validar bindings e chamadas somente de leitura antes de qualquer publicacao. Registrar os resultados da entrega aqui.

## Resultado da entrega
- PR [#92](https://github.com/joaoldsxyzbr/Assistente-mcps/pull/92) integrado na `main`: `ad76b1df5ccc05b9cf941970a267df4d6e47b066`.
- CI da branch [39300304576](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39300304576) e CI da `main` [39300457929](https://github.com/joaoldsxyzbr/Assistente-mcps/actions/runs/39300457929) aprovados: Node, testes de seguranca, navegador Chromium, Workerd e build dry-run.
- Cloudflare Worker `assistente`: versao `c7f17e7f-59f0-4ef5-b1a4-8e1fab546bf0` promovida em 19/10/2026 às 18:12 UTC, deploy `ef64883a-62c4-4e41-b948-561eafcac962`, **100% do trafego**. Versao anterior para rollback: `2ed2b7e4-4855-4930-b495-9af0b9a43485`.
- Os 15 bindings foram comparados por nome e tipo, sem alteracoes. OAuth e leitura `get_me` / `get_file_contents` reais confirmados. O bundle produtivo contem `github_relocate_directory`, validacoes de SHA e acesso Git Trees.
- A nova ferramenta ainda requer renovacao do catalogo MCP no ChatGPT para ser descoberta nesta conversa. Portanto, **nao foi feita uma chamada real `dryRun` pelo novo endpoint**, apenas testes simulados via CI. Recomendado executar previa somente de leitura em branch conhecida apos atualizar o plugin; nao fazer movimentacao real sem previa.
- A origem das falhas externas intermitentes de `push_files` nao foi comprovada ou totalmente eliminada. A ferramenta oferece um caminho mais eficiente para realocar arquivos existentes e nao substitui edicoes de conteudo.
