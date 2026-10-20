# Política de dependências — Assistente MCPs

## Regra do projeto

Usar **JavaScript puro (ES Modules)**, APIs nativas e as menores dependências necessárias. Preferir **SDKs oficiais e ferramentas mantidas por organizações reconhecidas**, com procedência verificável, manutenção ativa e atualizações de segurança.

A origem da dependência importa, mas nenhuma empresa ou projeto oferece garantia absoluta de segurança. Avaliar código, origem do pacote npm, mantenedores, cadeia de dependências, permissões, histórico de segurança e compatibilidade com Cloudflare Workers.

- **Permitidos como padrão:** SDKs oficiais essenciais do MCP e Cloudflare, Wrangler e ferramentas reconhecidas e mantidas por fornecedor identificável, após conferência de compatibilidade.
- **Não adicionar automaticamente:** bibliotecas de terceiros de autores independentes ou procedência desconhecida, projetos pouco mantidos, pacotes de origem não verificável ou dependências sem benefício claro. Mesmo quando populares, novas bibliotecas independentes exigem avaliação documentada e aprovação explícita do usuário.
- **Sem substituir bibliotecas já existentes automaticamente:** auditar primeiro o uso, origem, atualizações, vulnerabilidades e custo de remoção; apresentar opções ao usuário quando houver dúvida.
- **Segurança e privacidade:** não introduzir serviços de telemetria externos, upload de código, exposição de tokens, novos secrets ou scopes sem necessidade e aprovação. Manter lockfile versionado e CI de auditoria.
- **Evitar reinventar protocolos de segurança e autenticação oficiais** apenas para eliminar dependências; isso pode aumentar risco de falhas.
- **Transitivas:** SDKs oficiais também dependem de pacotes mantidos por terceiros. Conferir o grafo e o lockfile; não prometer «zero bibliotecas externas» sem auditoria do conjunto.
- **Critério de aceitação:** nome do fornecedor/mantenedor verificável, repositório de origem, manutenção atual, licença, reputação, segurança, objetivo concreto e testes. Nenhuma nova dependência sem justificativa.

## Inventário direto atual (19/10/2026)

| Dependência | Categoria/origem conhecida | Decisão atual |
| --- | --- | --- |
| `@modelcontextprotocol/client` e `@modelcontextprotocol/server` | SDK oficial do projeto Model Context Protocol | Manter |
| `@cloudflare/workers-oauth-provider` | Projeto oficial Cloudflare | Manter |
| `agents` | SDK oficial Cloudflare Agents | Manter |
| `wrangler` | Ferramenta oficial Cloudflare | Manter |
| `miniflare` | Ferramenta mantida pela Cloudflare | Manter para testes |
| `playwright` | Projeto mantido pela Microsoft | Manter para testes |
| `esbuild` | Projeto independente presente transitivamente no Wrangler | **Sem dependência direta** no projeto; testes Workerd usam bundle gerado pelo Wrangler |

Em 20/10/2026 foi removido o `esbuild` direto dos devDependencies; `npm run test:runtime` agora executa o build oficial do Wrangler e testa seu bundle. O Wrangler ainda utiliza `esbuild` transitivamente, portanto não se afirma ausência total de pacotes independentes. Nenhuma nova dependência foi adicionada.

Nenhuma dependência nova foi instalada ao estabelecer esta política. Esta lista contém somente as dependências **diretas**, conforme `package.json`; as dependências transitivas do `package-lock.json` precisam ser verificadas de acordo com a necessidade.

## Fluxo para futuros pedidos

1. Tentar primeiro JavaScript nativo e SDKs oficiais já instalados.
2. Se uma nova biblioteca for realmente necessária, comprovar fornecedor, segurança, privacidade e benefício.
3. Se for de mantenedor independente, pedir aprovação explícita ao usuário antes de instalar.
4. Validar `npm ci`, `npm audit`, `npm run check`, testes de browser/Workerd e dependências resolvidas no lockfile.
5. Registrar decisão e alteração neste repositório antes de promover Worker em produção.

**Fonte de verdade:** `joaoldsxyzbr/Assistente-mcps`. Não confundir JavaScript puro com ausência absoluta de SDKs/dependências externas.