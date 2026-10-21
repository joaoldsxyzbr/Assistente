# Repositório unificado: Assistente

O código do servidor MCP (Cloudflare Worker) e o plugin de especialistas agora vivem no mesmo repositório, com entregas separadas.

| Diretório | Responsabilidade |
| --- | --- |
| `plugin/` | Plugin ChatGPT, manifestos e skills (ZIP instalável) |
| `server/` e `mcps/` | Worker MCP, GitHub e Cloudflare |
| `tests/` e `scripts/` | Testes e validação |
| `docs/` | Documentação |
| `.github/` | CI e artefato ZIP |

## Plugin ChatGPT
O conteúdo de `plugin/` foi importado do repositório `joaoldsxyzbr/Assistente`, mantendo seu identificador de plugin e o vínculo com o app já existente. Para atualizar o plugin existente, baixe o artefato `assistente-plugin.zip` de uma execução bem-sucedida do workflow **CI** do GitHub Actions. Não instale o ZIP do repositório inteiro: nele também está o servidor.

Para gerar localmente: `git archive --format=zip --output=assistente-plugin.zip HEAD:plugin`.

## Worker MCP
O Wrangler continua apontando para `server/worker.js`; Worker, domínio, OAuth, secrets, bindings e URL não mudam por causa da unificação. **Merge no GitHub não publica deploy automaticamente.** Mantenha o procedimento de publicação controlada documentado no projeto.

## Testes e rollback
1. `npm ci`, `npm run check`, `npm run test:browser` e `npm run test:runtime`.
2. Verificar o ZIP e sua estrutura pela CI.
3. Testar a atualização do plugin existente no ChatGPT antes de arquivar o repositório anterior.
4. Se necessário, usar o commit anterior à integração na `main` ou atualizar o plugin com o ZIP anterior. O repositório original permanece intacto enquanto se valida o novo fluxo.

**Importante:** a cópia de arquivos entre repositórios não transfere os commits históricos para a árvore de destino. O histórico original continua preservado no repositório anterior até seu arquivamento. Não excluir esse repositório durante a transição.
