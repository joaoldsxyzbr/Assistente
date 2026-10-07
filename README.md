# Assistente

Hub técnico para agregar e encaminhar chamadas a MCPs especializados. No ChatGPT, o plugin **Assistente Geral** é a entrada única do usuário e mantém as skills e regras conversacionais. Este repositório contém o Worker host e os serviços MCP; as skills são mantidas no plugin, fora deste repositório.

## Responsabilidades

- **Assistente Geral (plugin):** regras de domínio, interpretação da intenção, seleção do fluxo e apresentação da resposta.
- **Assistente (host):** catálogo de contratos aprovados, autenticação das conexões e roteamento para MCPs; sem acesso direto aos bancos.
- **MCPs especializados:** validação técnica das operações e acesso apenas aos dados do seu domínio.

## Estado

- Ponto e Gastos têm servidores MCP próprios, ligados aos D1 existentes. Os arquivos Wrangler não criam tabelas nem executam migrações.
- O esquema dos dois D1s foi inspecionado; nenhum registro pessoal foi lido e nenhum dado ou schema foi alterado.
- O Worker genérico `cloudflare-mcp` existente não tinha binding para esses D1s nem ferramentas de domínio detectadas. O código do Assistente não o usa como atalho para executar código remoto.
- Os três Workers deste repositório estão implementados, mas ainda não foram publicados. Endpoints, secrets e conexão do plugin ao host ainda precisam ser configurados.
- O domínio planejado para o host é `assistente.joaolds.xyz.br`, com endpoint MCP em `https://assistente.joaolds.xyz.br/mcp`; DNS e domínio customizado ainda não foram configurados.
- A fundação foi integrada à `main` pelo [PR #2](https://github.com/joaoldsxyzbr/Assistente/pull/2). O plano e as próximas etapas estão em [docs/PLANO.md](docs/PLANO.md) e na [Issue #1](https://github.com/joaoldsxyzbr/Assistente/issues/1).

## Estrutura

| Worker | Responsabilidade | Acesso a dados |
|---|---|---|
| `assistente` | Catálogo e roteamento para ferramentas aprovadas | Sem binding D1 |
| `assistente-ponto-mcp` | Registros de ponto e banco de horas | Somente `PONTO_DB` |
| `assistente-gastos-mcp` | Movimentações e resumos financeiros | Somente `GASTOS_DB` |

Cloudflare MCP e DeskPilot poderão ser adicionados como conexões especializadas. Cada novo servidor precisa de contratos de ferramentas aprovados; uma conexão configurada não publica ferramentas automaticamente.

## Cloudflare Workers Builds

O Worker host conectado ao GitHub se chama `assistente`. Configure o diretório raiz como `/`, deixe o build command vazio e use `npx wrangler versions upload --config wrangler.assistente.jsonc` como deploy command. Isso valida e envia uma versão sem ativá-la em produção. Para ativar o Worker, use `npx wrangler deploy --config wrangler.assistente.jsonc` somente depois de configurar OAuth, secrets e conexões de runtime. O preview command é `npx wrangler preview --config wrangler.assistente.jsonc`.

## Requisitos e verificações

- Node.js 24 ou superior.
- npm.

```sh
npm install
npm run check
```

O comando `check` executa TypeScript, testes dos serviços e do roteador, e builds de validação dos três Workers com Wrangler em modo dry-run.

## Publicação

Configure `MCP_TOKEN` como secret em cada Worker de domínio e `ASSISTENTE_MCP_TOKEN` no Worker host. Use tokens diferentes, com pelo menos 32 caracteres. No host, configure `MCP_PONTO_URL`, `MCP_PONTO_TOKEN`, `MCP_GASTOS_URL` e `MCP_GASTOS_TOKEN`; os tokens do host devem corresponder aos secrets dos Workers de domínio.

O acesso do ChatGPT ao host usará OAuth 2.1; esse fluxo ainda não foi implementado. O API Token da Cloudflare chamado `Assistente Cloudflare`, quando a integração existir, ficará como secret no componente MCP que chama a API da Cloudflare. Ele é diferente da credencial usada pelo host para chamar esse MCP.

Os endpoints devem apontar para o caminho `/mcp` usando HTTPS. As credenciais entram como secrets/variáveis do runtime, nunca em arquivos versionados. Os nomes dos Workers, bindings existentes e passos restantes estão descritos em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
