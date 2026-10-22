# Ferramentas diretas GitHub

O Assistente MCPs mantém o OAuth atual e executa cada chamada pelo MCP oficial GitHub.

**Leitura (mcp:read):** github_ler_arquivo, github_estrutura, github_branches, github_commits, github_pesquisar_codigo, github_pull_requests, github_detalhar_pr e github_execucoes_ci.

**Escrita (mcp:write):** github_criar_branch e github_criar_pr. Nenhuma delas faz merge ou deploy automaticamente.

As ferramentas existentes github_edit_file (substituição exata com dryRun e validação SHA) e github_relocate_directory continuam. As ferramentas genéricas mcp_github_tools e mcp_github_call permanecem como fallback.

Contratos e validação: mcps/github/tools/contratos.js. Registro e encaminhamento: mcps/github/tools/diretas.js. Testes: mcps/github/tests/diretas.test.js.

Não há novas dependências. Chamadas mutáveis incertas não são repetidas automaticamente. Limite de resposta e tratamento de erro seguem a ponte existente.

Após validar CI e fazer deploy do Worker, atualizar ou reconectar o Assistente MCPs no ChatGPT para obter o novo catálogo.
