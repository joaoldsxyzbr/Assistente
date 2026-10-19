# Pesquisa de boas praticas — Assistente MCPs (19/10/2026)

## Escopo e estado auditado
Repository unico: `joaoldsxyzbr/Assistente-mcps`, branch `main` (commit inspecionado `c1b880aaf7b59c1634336e9193a290b905f1c880`). **Este documento e uma pesquisa/proposta; nenhuma alteracao funcional e autorizada ou entregue por ele.**

Stack existente: JavaScript puro ES Modules; Cloudflare Worker; `@modelcontextprotocol/client` e `@modelcontextprotocol/server` v2; `agents` (createMcpHandler); `@cloudflare/workers-oauth-provider`; GitHub MCP remoto (toolset all); Cloudflare MCP remoto; OAuth upstream com tokens cifrados em KV; tres skills locais; CI Node Test Runner, Miniflare/Workerd, Playwright e Wrangler. Sem React, Vite ou TypeScript no codigo do projeto.

Limites existentes: GitHub `push_files` 8 arquivos / 128 KiB por chamada; 90 s de `tools/call` longo; 100 s HTTP; 64 KiB de saida normalizada; 2 MiB de resposta upstream; 120 chamadas autenticadas/minuto/operador. `github_relocate_directory` reutiliza blobs Git existentes sem retransmitir conteudo.

## Verificacoes relevantes e lacunas
1. **Catalogo MCP congelado no cliente (prioridade imediata):** a `main` publica `github_relocate_directory`, mas o ChatGPT usado na auditoria expunha apenas as seis ferramentas anteriores. Documentacao da OpenAI: atualizacoes de ferramentas MCP personalizadas podem exigir refresh das acoes da app. Nao assumir que atualizar Worker atualiza ferramentas no ChatGPT.
2. **Edicao de arquivo grande (prioridade alta):** `push_files` e `create_or_update_file` exigem retransmitir arquivos completos; existe issue #3231 no MCP oficial GitHub descrevendo truncamento ~303 KiB e solicitando patch seguro. A nova operacao de realocacao resolve copia/movimentacao, nao alteracoes de codigo.
3. **OAuth distribuido (investigar):** `server/upstream-oauth.js` usa `refreshFlights` (WeakMap) para agrupar renovacoes por instancia, mas Workers KV e eventualmente consistente entre localidades; concorrencia entre instancias nao fica coordenada. Testar refresh simultaneo em instancias distintas antes de adicionar Durable Object.
4. **Observabilidade de resultados:** HTTP 200 e fim do stream provam apenas execucao/transmissao pelo Worker, nao interpretacao no ChatGPT nem escrita aplicada. Manter verificacao de SHA/commit no GitHub apos toda gravacao.
5. **Rate limits:** GitHub tem limites secundarios para concorrencia e criacao de conteudo; nao repetir escrita automaticamente. Backoff com `Retry-After` somente para leitura segura, com limite de repeticoes e tratamento de 403/429.
6. **Seguranca:** OAuth App GitHub atual pede escopos amplos. Github Apps fornecem permissoes por repositorio e tokens temporarios, mas migrar exige avaliacao de compatibilidade com o MCP remoto/OAuth; nao trocar automaticamente. Confirmar rotacao do client secret anteriormente exposto sem imprimir segredo.
7. **Fluxo e metadados:** no codigo, `github_relocate_directory` anuncia previa, mas a garantia real e `expectedHeadSha` no momento da escrita; nao ha comprovacao persistente de que uma chamada de previa aconteceu antes. Se isso for um requisito de seguranca, definir um contrato de confirmacao verificavel. Declarar corretamente a semantica de dry-run. Avaliar anotacoes MCP `readOnlyHint` para ferramentas exclusivamente de leitura (hints nao substituem permissoes).

## Recomendacoes priorizadas

### P0 — validar descobertas e transporte do ChatGPT
- Reexaminar o catalogo da app no cliente, atualizar a lista de ferramentas quando o produto permitir, testar o novo metodo em dry-run real.
- Acrescentar um smoke test independente do ChatGPT via **MCP Inspector CLI** para `tools/list`, `tools/call`, JSON/SSE, OAuth, resposta de erros e concorrencia simulada, sem credenciais reais no CI.
- Preservar contratos estaveis (preferir ampliar o fluxo existente antes de multiplicar ferramentas) e medir falhas antes/depois.

### P1 — edicao por patch no proprio Worker
- Projetar `github_apply_patch`: carregar texto do arquivo diretamente do GitHub, validar SHA do blob e SHA da branch, aplicar **patch contextual exato** com `diff` (jsdiff, ES Modules; `fuzzFactor: 0`), criar tree/commit e atualizar ref sem force.
- Limitar bytes de patch e tamanho do arquivo, recusar binarios, symlinks, conflitos e truncamentos. Conferir SHA/conteudo resultante apos a escrita. Uma unica confirmacao e **nenhum retry de escrita incerta**.
- Para repos grandes, manter `github_relocate_directory` para movimentar e usar patch somente para editar imports; fluxo branch → CI → PR → merge. Testar EOL CRLF/LF, UTF-8, ausencia de newline, hunk fora de contexto e concorrencia.

### P2 — concorrencia OAuth, observabilidade e seguranca
- Reproduzir duas renovacoes simultaneas em isolados e localidades diferentes, decidir se KV + mutex por instancia basta ou se um Durable Object minimalista e justificado.
- Registros estruturados ja existem na Cloudflare: melhorar metricas de falha por etapa (sem argumentos, caminhos ou tokens), com plano de alerta/consulta e verificacao de efeito remoto.
- Revisar escopos GitHub somente apos avaliar ferramentas usadas; rotacionar segredo pendente pelo painel seguro.

### Bibliotecas: o que manter, adicionar ou evitar
| Ferramenta | Decisao | Justificativa |
| --- | --- | --- |
| MCP SDK v2 / `agents` / Workers OAuth Provider | manter | arquitetura MCP oficial e compatibilidade Workers |
| Node Test Runner / Miniflare / Playwright / Wrangler | manter | testes e build existentes suficientes |
| `diff` (jsdiff) | **adicionar somente ao implementar patches** | aplicar diff contextual com testes; evita parser proprio |
| `@modelcontextprotocol/inspector` CLI | usar em CI/debug (dev) | teste MCP independente do cliente ChatGPT |
| `@octokit/request` | opcional | vantajoso se o numero de endpoints REST proprios crescer; `fetch` atual ainda e simples |
| `@octokit/plugin-throttling` | **nao adicionar automaticamente** | usa recursos de scheduling/Bottleneck que exigem avaliacao de compatibilidade com Workerd e politica de retries; melhor esperar medicao |
| React/Vite, Express/Hono, Axios, ORMs, Vitest | nao adicionar | nao resolvem o problema identificado ou duplicam recursos existentes |
| Durable Objects | condicional | somente se concorrencia distribuida de tokens for reproduzida |

## Fontes oficiais e tecnicas
- SDK MCP v2: https://github.com/modelcontextprotocol/typescript-sdk
- Especificacao e ferramentas MCP: https://github.com/modelcontextprotocol/modelcontextprotocol
- GitHub MCP oficial: https://github.com/github/github-mcp-server
- Relato de patch seguro: https://github.com/github/github-mcp-server/issues/3231
- Git Trees: https://docs.github.com/en/rest/git/trees
- Git Blobs: https://docs.github.com/en/rest/git/blobs
- Git Refs: https://docs.github.com/en/rest/git/refs
- GitHub secondary rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- GitHub App versus OAuth App: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps
- Cloudflare KV consistencia: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Cloudflare Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- MCP Inspector CLI: https://github.com/modelcontextprotocol/inspector
- jsdiff: https://github.com/kpdecker/jsdiff
- Apps MCP customizadas ChatGPT: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## Criterios para autorizar implementacao
Definir primeiro testes reproduziveis de ponta a ponta; depois patch seguro e validacao do SHA, mantendo stack e Worker; so entao investigar componente distribuido se houver sinais reais de race. Nao aumentar limites arbitrariamente, nao refazer arquitetura, nao introduzir novas dependencias de producao sem beneficio mensuravel.
