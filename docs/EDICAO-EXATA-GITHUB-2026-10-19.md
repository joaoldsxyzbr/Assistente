# Edição segura de arquivos existentes — JavaScript puro

## Por que implementar somente o necessário

O MCP oficial GitHub mantém `push_files` e `create_or_update_file`, mas essas ferramentas normalmente exigem enviar todo o código do arquivo pelo ChatGPT. Para alterações pequenas em arquivos grandes, a ferramenta complementar `github_edit_file` envia apenas pares `find` / `replace` e processa o conteúdo dentro do Worker usando o token OAuth já conectado.

**Implementação própria**, sem copiar nem incluir a biblioteca jsdiff. Não são necessários React, TypeScript, outras bibliotecas ou novos secrets.

## Fluxo de uso

1. Trabalhar numa branch criada previamente, jamais na `main`. Informar `owner`, `repo`, `branch`, `path` e `edits: [{find, replace}]`.
2. Chamar com `dryRun: true` (padrão): o Worker lê o arquivo e valida os trechos, mas devolve somente quantidade de edições, tamanhos, `headSha` e `blobSha`. **Nenhum conteúdo do arquivo é devolvido ou registrado em logs.**
3. Inspecionar a intenção de alteração. Executar com `dryRun: false`, `expectedHeadSha`, `expectedBlobSha` da prévia e `message`.
4. O Worker lê a revisão imutável, confirma tipo, modo e SHA, faz substituições exatas de correspondência única, cria um blob Git, uma tree, um commit e atualiza a branch sem `force`.
5. Verificar o commit no GitHub e rodar os testes antes de abrir/mesclar o PR. Se ocorrer erro incerto, **consultar o estado da branch antes de qualquer repetição**.

## Segurança, privacidade e limites

- Apenas arquivos UTF-8 válidos com até 512 KiB. Binários, NUL, links simbólicos e submódulos são recusados. Modo executável `100755` é preservado.
- Até 12 substituições por chamada, até 24 KiB de argumentos de edição em UTF-8.
- Substituições são exatas: não usam fuzzy matching, expressões regulares ou execução de comandos arbitrários.
- Cada `find` precisa existir **uma única vez** na versão corrente. Um trecho ausente ou duplicado bloqueia a operação antes da escrita.
- Validação do SHA da branch e do blob, e atualização não forçada do ref Git.
- Não cria arquivos novos, não faz merge, não modifica D1, OAuth, rate limiters ou escopos. Não salva conteúdo em cache nem em logs.
- A prévia faz leitura sem gravar. A garantia de integridade na execução são `expectedHeadSha` e `expectedBlobSha`; não existe registro persistente da prévia. Isto deve ser comunicado como tal.
- Um timeout pode acontecer depois de um commit; nunca repetir escritas automaticamente.

## Por que não copiar a biblioteca inteira?

Uma implementação geral de unified diff requer análise de hunks, deslocamentos, EOL, fuzz e recuperação de conflitos. Isso amplia a superfície de erro sem necessidade comprovada. Preferimos uma operação **deliberadamente restrita**, de comportamento previsível e com testes. A biblioteca `diff` permanece opção futura caso apareça demanda real por patches complexos.

## Testes e publicação

- Testes unitários: UTF-8, CRLF, trechos únicos/ambíguos, ausência de contexto, limite de tamanho, links simbólicos, SHA antigo, arquivo executável e escrita de resultado incerto.
- Teste MCP / Workerd: novo catálogo com 8 ferramentas, mantendo OAuth e skills existentes.
- CI: `npm run check`, `npm run test:browser`, `npm run test:runtime`.
- Antes da publicação: comparar bindings da Cloudflare, confirmar versões e promover explicitamente a nova versão.
- Após publicar: conferir `tools/list` no cliente atualizado e executar uma **prévia real sem escrita** em branch de teste autorizada. A ferramenta nova pode requerer recarregar/atualizar a conexão MCP do ChatGPT.

## Fontes

- Git Database API: https://docs.github.com/en/rest/git
- Git Blobs: https://docs.github.com/en/rest/git/blobs
- Git Trees: https://docs.github.com/en/rest/git/trees
- Git Refs: https://docs.github.com/en/rest/git/refs
- Revisão e pesquisa: [PESQUISA-BOAS-PRATICAS-2026-10-19.md](PESQUISA-BOAS-PRATICAS-2026-10-19.md)

## Resultado da implementação

Preencher após CI, merge e publicação.
