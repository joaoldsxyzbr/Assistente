# MCPs oficiais como infraestrutura, ferramentas próprias como interface

O ChatGPT usa exclusivamente ferramentas registradas pelo Assistente MCPs. Os MCPs **oficiais** do GitHub e Cloudflare, assim como o OAuth, ficam internamente no Worker. Não publicamos `mcp_*_tools` nem `mcp_*_call`.

## GitHub (15 ferramentas)

Leitura: `github_ler_arquivo`, `github_estrutura`, `github_branches`, `github_commits`, `github_pesquisar_codigo`, `github_pull_requests`, `github_detalhar_pr`, `github_execucoes_ci`.

Escrita: `github_criar_branch`, `github_criar_pr`, `github_edit_file` (substituição exata, dryRun, SHA), `github_relocate_directory`, `github_enviar_arquivos` (até 8 arquivos/128 KiB), `github_integrar_pr` (SHA esperado) e `github_excluir_arquivo`.

## Cloudflare (9 ferramentas)

Leitura: `cloudflare_contas`, `cloudflare_workers`, `cloudflare_bancos_d1`, `cloudflare_documentacao`, `cloudflare_d1_consultar`, `cloudflare_worker_versoes`, `cloudflare_worker_deployments`.

Escrita: `cloudflare_d1_executar` (SQL de uma instrução, parâmetros, confirmação e dryRun) e `cloudflare_worker_publicar_versao` (deploy 100% de versão existente, confirmação/dryRun). Os wrappers Cloudflare não aceitam código JavaScript arbitrário.

**Limite de cobertura:** upload de código-fonte de Worker e demais APIs específicas não estão expostos. Para usá-los pelo ChatGPT é necessário implementar um novo contrato próprio. A rota genérica oficial não aparece no catálogo.

## Segurança

OAuth independente ChatGPT → Worker e Worker → provedores; tokens cifrados em KV, permissões `mcp:read` e `mcp:write`, validações, rate limits e auditoria sem dados sensíveis. Mudanças não são repetidas automaticamente após erro incerto. Não enviar segredos ao ChatGPT.

## Testes e deploy

CI inclui verificação Node, browser, Workerd e build dry-run. Merge no GitHub não implanta versão Cloudflare; após publicar, renovar o catálogo do cliente ChatGPT.
