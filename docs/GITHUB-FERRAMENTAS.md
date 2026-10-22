# Ferramentas próprias do GitHub

O Assistente MCPs mantém OAuth e MCP oficial GitHub exclusivamente nos bastidores. O ChatGPT só recebe nomes e contratos das ferramentas implementadas em `mcps/github/`.

**Leitura:** `github_ler_arquivo`, `github_estrutura`, `github_branches`, `github_commits`, `github_pesquisar_codigo`, `github_pull_requests`, `github_detalhar_pr`, `github_execucoes_ci`.

**Escrita:** `github_criar_branch`, `github_criar_pr`, `github_edit_file` (prévia com `dryRun`, proteção por SHA) e `github_relocate_directory`.

As operações são delegadas internamente ao provedor oficial quando aplicável, mas os comandos genéricos `mcp_github_tools` e `mcp_github_call` não são publicados. Funcionalidades sem ferramenta própria ainda precisam ser implementadas.
