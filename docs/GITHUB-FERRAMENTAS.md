# Ferramentas próprias do GitHub

A integração usa OAuth e o MCP **oficial GitHub no backend**. No ChatGPT estão apenas 15 ferramentas próprias.

Leituras: `github_ler_arquivo`, `github_estrutura`, `github_branches`, `github_commits`, `github_pesquisar_codigo`, `github_pull_requests`, `github_detalhar_pr` e `github_execucoes_ci`.

Escritas: `github_criar_branch`, `github_criar_pr`, `github_edit_file`, `github_relocate_directory`, `github_enviar_arquivos`, `github_integrar_pr`, `github_excluir_arquivo`.

- Edição exata: `dryRun` e controle concorrente por SHA para preservar contexto.
- Envio de arquivos: máximo 8 arquivos/128 KiB; não escreve diretamente em `main` ou `master`.
- Merge de PR: exige SHA esperado e confirmação explícita.
- Exclusão: branch de trabalho, confirmação obrigatória.
- O servidor oficial executa as operações internamente, sem o cliente conhecer o nome das ferramentas upstream.

Módulos e testes ficam inteiros em `mcps/github/`.
