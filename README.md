# Assistente

O Assistente é o hub técnico que conecta o plugin **Assistente Geral** a vários MCPs. O plugin continua sendo a entrada do usuário no ChatGPT e a fonte das skills e regras conversacionais. Este repositório mantém o Worker host e um módulo por MCP conectado.

## Responsabilidades

- **Assistente Geral (plugin):** skills, regras de domínio, interpretação da intenção e orientação sobre o fluxo de conversa.
- **Assistente (host):** autentica a entrada, publica apenas ferramentas aprovadas e encaminha chamadas a MCPs de destino.
- **Módulo em `src/mcps/<nome>`:** mantém o contrato e a integração específica de um MCP, isolados dos demais.
- **MCP de destino:** valida suas operações e acessa os recursos autorizados pelo token próprio.

Ponto e Gastos não fazem parte deste repositório. Suas regras continuam no plugin `Assistente Geral`; este projeto não hospeda Workers de Ponto/Gastos nem se conecta aos seus D1s.

## Estrutura atual

| Parte | Responsabilidade |
|---|---|
| Worker `assistente` | Endpoint MCP único para o ChatGPT e roteador dos MCPs conectados |
| `src/mcps/cloudflare/` | Contratos das ferramentas do Cloudflare MCP |
| Cloudflare MCP | Integração inicial; ferramentas aprovadas: documentação, busca OpenAPI e execução Cloudflare API |
| Futuras pastas em `src/mcps/` | Um módulo isolado por MCP adicional, depois de definir ferramentas e permissões |

As pastas são módulos do hub, não Workers implantados individualmente. A primeira etapa tem apenas o Worker host `assistente`. A integração Cloudflare não ganha acesso por estar configurada: o host só expõe os contratos locais.

## Estado

- O host e o contrato do Cloudflare MCP estão implementados no repositório; ainda não foram publicados.
- O host não tem binding D1 e não acessa dados de Ponto ou Gastos.
- O domínio planejado é `assistente.joaolds.xyz.br`, com endpoint `https://assistente.joaolds.xyz.br/mcp`; DNS e domínio customizado ainda não foram configurados.
- OAuth 2.1 entre ChatGPT e host, secrets de runtime e conexão com o plugin ainda precisam ser configurados.
- O plano está em [docs/PLANO.md](docs/PLANO.md) e na [Issue #1](https://github.com/joaoldsxyzbr/Assistente/issues/1).

## Cloudflare Workers Builds

O Worker conectado ao GitHub se chama `assistente`. Configure o diretório raiz como `/`, deixe o build command vazio e use `npx wrangler versions upload --config wrangler.assistente.jsonc` como deploy command. Isso envia uma versão sem ativá-la em produção. Para ativar, use `npx wrangler deploy --config wrangler.assistente.jsonc` somente depois de configurar OAuth, secrets e conexões de runtime. O preview command é `npx wrangler preview --config wrangler.assistente.jsonc`.

## Requisitos e verificações

- Node.js 24 ou superior.
- npm.

```sh
npm install
npm run check
```

O comando `check` executa typecheck, testes e build dry-run do Worker host.

## Credenciais

- `ASSISTENTE_MCP_TOKEN`: protege o endpoint do host enquanto OAuth ainda não foi implementado.
- `MCP_CLOUDFLARE_URL` e `MCP_CLOUDFLARE_TOKEN`: endereço HTTPS e credencial de serviço do host para o Cloudflare MCP.
- O API Token `Assistente Cloudflare` usado para chamar a API Cloudflare fica como secret no runtime do componente MCP que executa essas chamadas. Ele não é o token host→MCP nem o OAuth do ChatGPT.

Credenciais são secrets do runtime, nunca valores versionados. Mantenha o API Token Cloudflare com o menor conjunto de permissões necessário; a ferramenta `execute` pode ler ou escrever conforme as permissões desse token.
