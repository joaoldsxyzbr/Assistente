# Auditoria do Assistente MCPs — 16/10/2026

## Escopo e resultado

Revisados: entrada do Worker, OAuth ChatGPT/Assistente, OAuth GitHub/Cloudflare, discovery, DCR, PKCE, armazenamento/renovação/revogação, cliente/proxy MCP, skills e referências SQL, dependências, scripts, CI, documentação e configuração de produção/preview.

A falha do botão foi reproduzida em Chromium com um servidor HTTPS local e provedores simulados: o POST retornava o redirecionamento correto, mas a CSP `form-action 'self'` bloqueava a navegação ao provedor. O navegador permanecia na página e emitia uma violação `form-action`. O teste conserva esse cenário como regressão.

A política corrigida permite os hosts oficiais do provedor. O POST responde **303**, convertendo a navegação seguinte em **GET**, sem senha na URL/corpo enviado ao provedor. GitHub e Cloudflare passam no teste de clique e callback. O formulário também foi ajustado para celular e apresenta opção de tentar novamente após senha incorreta.

## Achados e correções

| Área | Achado | Correção / evidência |
| --- | --- | --- |
| Navegador — bloqueante | CSP bloqueava redirecionamento externo após POST | Allowlist estática por provedor; teste demonstra bloqueio antigo e sucesso corrigido |
| OAuth — segurança | Callback ignorava `iss`; parâmetros duplicados e erros não passavam pela mesma validação | Vincular issuer ao estado; validar issuer anunciado, duplicidade, prazo e estado também em recusas |
| Discovery — segurança | Resource/issuer/PKCE com validação incompleta | Validar resource exato, issuer obrigatório e S256 quando anunciado |
| HTTP — confiabilidade | Requests podiam aguardar indefinidamente; transporte MCP seguia redirects | Timeout/AbortSignal; modo `manual` compatível com Workerd; rejeição explícita de redirects |
| DCR Cloudflare | Registro em cache não vinculado à URL de callback/issuer | Invalidar cache após mudança de callback/issuer; solicitar `offline_access` e escopos básicos anunciados |
| Refresh | Requests concorrentes podiam renovar o mesmo token no mesmo isolate | Agrupar chamadas concorrentes por KV/provedor; validar resposta antes de persistir |
| MCP | Corte em 200.000 caracteres produzia JSON incompleto e descartava mídia/resources | Preservar resultados e catálogo completos, `structuredContent` e `_meta`; paginação já é tratada pelo SDK |
| Skills | Referências SQL/EXECUCAO existiam, mas não estavam acessíveis pela ferramenta | Publicar somente referências empacotadas via `assistente_skill(nome, arquivo)`; impedir caminhos arbitrários |
| Gastos | Verificação SQL de duplicidade não normalizava corretamente tabulação/espaço não separável | Usar `char(...)` no SQL e validar envelope Cloudflare; teste de concorrência simulada em SQLite local |
| Dependências | `npm audit` indicava seis alertas altos no conjunto instalado | Atualizar SDK MCP, Agents e Wrangler; auditoria posterior com zero alertas conhecidos |
| Documentação | Afirmava que produção não fora publicada e credenciais estavam ausentes | Atualizar estado e separar publicação de código de consentimento real das contas |
| CI | Testes Node não detectaram diferenças de navegador e Workerd | Adicionar Chromium, integração de protocolo MCP e runtime Workerd ao CI |

## Verificações reproduzíveis

Resultado local: **51 testes Node + 4 testes Chromium + 1 teste Workerd aprovados**, dois builds dry-run concluídos e `npm audit` sem vulnerabilidades conhecidas no conjunto instalado.

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
npm run test:browser
npm run test:runtime
npm audit
```

- Testes Node: OAuth simulado, segurança de callbacks, cifragem, refresh concorrente, revogação, escopos, protocolo MCP e acesso às referências.
- Chromium: reproduzir CSP antiga bloqueada; clique/callback GitHub; clique/callback Cloudflare; senha incorreta; layout de 390 px sem rolagem horizontal.
- Workerd/Miniflare: OAuth upstream com início 303 e callback 200; MCP sem autenticação retorna 401; cadastro de cliente, consentimento, troca PKCE e inicialização MCP autenticada; seis ferramentas e SQL da skill acessíveis.
- SQLite em memória: sequência de ponto em dia útil, sábado, duplicidade e horários fora de ordem; concorrência simulada na duplicidade de gastos. Nenhum teste usa D1 pessoal.
- Build dry-run de produção e preview, sincronização de catálogo, sintaxe JavaScript e verificação de diff.
- O binário padrão Chromium não pôde ser baixado neste ambiente (CDN devolveu HTML em vez de ZIP). A execução local usou Chromium 141 empacotado temporariamente, com `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; CI instala a versão correspondente ao Playwright.

## Limites e pendências reais

1. **Consentimento:** a consulta ao Assistente em produção mostrou GitHub e Cloudflare ainda desconectados durante a auditoria. Somente o operador pode confirmar suas contas/permissões nas telas oficiais. Depois, confirmar uma leitura real de cada MCP, refresh e revogação; provedores simulados não comprovam isso.
2. **KV/concorrência:** remoção de estado e renovação não são transações globais. O agrupamento de refresh cobre apenas o mesmo isolate. Consistência eventual do KV pode permitir disputa entre isolates; armazenamento transacional (por exemplo Durable Objects) seria necessário para garantias globais. O serviço atual é de operador único, não multiusuário.
3. **Credencial divulgada:** o client secret GitHub foi compartilhado no histórico da conversa. Rotacionar no OAuth App GitHub e atualizar `GITHUB_OAUTH_CLIENT_SECRET` no Worker; não publicar o valor. A auditoria não recupera nem reproduz secrets.
4. **Permissões efetivas:** dependem do OAuth App, escopos e consentimento. `assistente_status` confirma token local utilizável, não autorização de todas as ferramentas remotas. Chamadas de escrita incertas exigem reconciliação antes de repetir.
5. **Operação de dados:** Ponto e Gastos são instruções e referências executadas pelas ferramentas oficiais; não constituem uma API de domínio isolada com validação obrigatória no servidor. O operador/modelo deve seguir as validações publicadas antes de chamadas D1.

## Fontes consultadas

- CSP e redirecionamentos de formulários: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action
- GitHub OAuth: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Cloudflare MCP: https://github.com/cloudflare/mcp
- SDK MCP OAuth: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/oauth.md
- Advisory SDK MCP corrigido: https://github.com/advisories/GHSA-6qxp-vccf-f47h
