# Arquitetura do Assistente

## Objetivo

Este repositório implementa um hub MCP para o plugin `Assistente Geral`. O plugin mantém as skills e regras conversacionais; o Worker host agrega os contratos dos MCPs conectados e roteia cada chamada ao destino certo.

A estrutura recomendada é **um módulo por MCP em `src/mcps/<nome>` e um único Worker host**. Cada módulo isola contrato, schema, credenciais e integração. Os diretórios não são implantados como Workers separados.

## Responsabilidades

| Camada | O que contém |
|---|---|
| Plugin `Assistente Geral` | Skills e regras de domínio/conversa, roteamento por intenção e apresentação dos resultados. É a fonte canônica dessas instruções e vive fora deste repositório. |
| Worker host `assistente` | Endpoint MCP único, autenticação do cliente, catálogo allowlist e roteamento para os módulos MCP. Não tem acesso direto a APIs de domínio nem a D1. |
| `src/mcps/cloudflare/` | Contratos das ferramentas aprovadas para a integração Cloudflare. Novos MCPs recebem pastas próprias. |
| MCP de destino | Validação técnica da chamada, autenticação no serviço e aplicação das permissões do token. |

Regras conversacionais não são copiadas para o Worker. Proteções que precisam funcionar mesmo fora do chat — schema, allowlist, validação e autorização no serviço — continuam aplicadas pelo código e pelo MCP de destino.

## Escopo atual

- **Incluído:** um Worker `assistente` e o conector ao Cloudflare MCP.
- **Fora deste repositório:** servidores e acesso a dados de Ponto e Gastos. As skills e regras continuam no plugin `Assistente Geral`; os D1 existentes não são alterados.
- **Futuro:** outros MCPs podem ser adicionados em pastas próprias, com contrato, endpoint e credencial independentes.

O catálogo inicial do Cloudflare MCP expõe três ferramentas: `docs` (consulta documental), `search` (pesquisa OpenAPI) e `execute` (chamada à API Cloudflare através do MCP remoto). O host não expõe ferramentas remotas descobertas dinamicamente; cada ferramenta precisa estar declarada no contrato local.

## Credenciais e autenticação

| Origem → destino | Credencial | Onde fica |
|---|---|---|
| ChatGPT / plugin Assistente Geral → host | OAuth 2.1 planejado; atualmente o host valida bearer token estático | OAuth ainda não implementado; secret atual `ASSISTENTE_MCP_TOKEN` |
| Host → Cloudflare MCP | Credencial de serviço independente | Secrets do Worker host: `MCP_CLOUDFLARE_URL` e `MCP_CLOUDFLARE_TOKEN` |
| Cloudflare MCP → API Cloudflare | API Token dedicado `Assistente Cloudflare`, com permissões mínimas | Secret no runtime do componente que executa as chamadas Cloudflare |

Essas credenciais têm finalidades diferentes. O OAuth do usuário não é encaminhado ao MCP remoto; o API Token Cloudflare não é usado como credencial do ChatGPT nem como token host→MCP.

A ferramenta `execute` pode ler ou alterar recursos conforme os escopos do API Token. O plugin `Assistente Geral` mantém as regras de uso; o token deve ter só as permissões necessárias e ser ampliado quando uma operação aprovada exigir.

## Segurança e limites

- O host aceita somente endpoint HTTPS sem credenciais na URL, query string ou fragmento.
- O catálogo local é allowlist; a configuração de um MCP não publica automaticamente qualquer ferramenta.
- Chamadas são encaminhadas a um único MCP. O host não fornece execução genérica de código nem tenta novamente uma chamada que possa ter escrito.
- Erros remotos não revelam URL, token ou exceção interna.
- Nenhum Worker deste repositório tem binding D1.
- Nenhum código ou configuração deste repositório lê, cria ou migra os D1 de Ponto e Gastos.

## Deploy

O domínio planejado é `assistente.joaolds.xyz.br`, com endpoint MCP em `https://assistente.joaolds.xyz.br/mcp`. DNS/TLS ainda não foram configurados.

O arquivo `wrangler.assistente.jsonc` define o único Worker do projeto. `npm run build:workers` valida seu bundle em dry-run sem publicar.

## Organização do código

```text
src/host/                    endpoint, autenticação e roteamento do hub
src/mcps/contracts.ts        contrato comum dos módulos MCP
src/mcps/catalog.ts          catálogo agregado que o host expõe
src/mcps/cloudflare/         schemas e ferramentas do Cloudflare MCP
src/shared/                  autenticação do Worker
tests/                       testes sintéticos do host e dos contratos
```
