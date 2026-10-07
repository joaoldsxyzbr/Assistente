# Arquitetura do Assistente

## Papel do projeto

O Assistente organiza ferramentas de vários domínios sem juntar seus dados ou credenciais. O host mantém um catálogo explícito e encaminha cada chamada a um servidor MCP. Cada domínio tem implantação e permissões próprias.

```text
Cliente MCP
└── Assistente host (sem acesso direto a bancos)
    ├── Ponto MCP ─── binding PONTO_DB ─── D1 de ponto existente
    └── Gastos MCP ── binding GASTOS_DB ── D1 de gastos existente
```

Cloudflare MCP e DeskPilot seguem como integrações planejadas. O host não revela ferramentas dessas conexões sem um contrato local aprovado.

## Limites e segurança

- Os bancos existentes são preservados; não há migrações nem criação de tabelas.
- O Worker de Ponto tem apenas `PONTO_DB`; o Worker de Gastos tem apenas `GASTOS_DB`; o host não tem binding D1.
- Cada Worker valida um token bearer independente no caminho `/mcp`. Tokens precisam ter no mínimo 32 caracteres e ficam em secrets do runtime.
- O host usa uma lista local de ferramentas e schemas. Não repassa execução de código genérica nem descobre permissões implicitamente no MCP remoto.
- O host encaminha cada chamada a um único servidor. Uma falha não impede o uso de outro domínio.
- Escritas não são repetidas automaticamente após falha de rede. Se uma resposta se perder, o host orienta consultar o MCP de origem antes de tentar de novo.
- Respostas de status não expõem endpoints, tokens ou exceções remotas.
- A exclusão de gastos exige `confirmar=true`; ajustes e movimentações repetidos pedem confirmação quando houver correspondência provável.

## Estado da integração

Foram inspecionados somente metadados de schema e índices dos D1s existentes. Nenhum registro pessoal foi lido. O código usa os nomes e estruturas atuais:

- Ponto: tabelas `pontos` e `ajustes_banco_horas`.
- Gastos: tabelas mensais `movimentacoes_MM_AAAA`.

Os MCPs de Ponto e Gastos estão implementados no repositório com acesso ao respectivo binding. Ainda não foram publicados nem chamados contra registros de produção. O Worker existente `cloudflare-mcp` não tinha bindings D1 nem ferramentas de domínio detectadas na inspeção; por isso não é tratado como interface para esses serviços.

## Configuração

Cada Worker de domínio usa `MCP_TOKEN`; o host usa `ASSISTENTE_MCP_TOKEN`. São secrets distintos. No host, forneça URL HTTPS e token correspondente por conexão:

| Servidor | Endpoint | Token no host |
|---|---|---|
| Ponto | `MCP_PONTO_URL` | `MCP_PONTO_TOKEN` |
| Gastos | `MCP_GASTOS_URL` | `MCP_GASTOS_TOKEN` |
| Cloudflare | `MCP_CLOUDFLARE_URL` | `MCP_CLOUDFLARE_TOKEN` |
| DeskPilot | `MCP_DESKPILOT_URL` | `MCP_DESKPILOT_TOKEN` |

O fluxo previsto é OAuth 2.1 entre ChatGPT e o host. O código atual ainda usa bearer token nesse endpoint e não implementa o fluxo OAuth. Entre o host e Ponto/Gastos, cada API MCP recebe sua credencial de serviço separada; o token OAuth do usuário não é repassado. O endpoint bearer atual não configura sozinho um conector ChatGPT.

Cloudflare MCP e DeskPilot ainda não têm contratos de ferramentas no host. Para Cloudflare, a integração usará um API Token dedicado chamado `Assistente Cloudflare`, começando com as permissões mínimas e ampliando somente quando uma ferramenta precisar delas.

Os arquivos `wrangler.ponto.jsonc` e `wrangler.gastos.jsonc` apontam aos IDs dos D1s existentes e dão a cada Worker apenas o seu binding. `wrangler.assistente.jsonc` não declara banco. `npm run build:workers` valida os três bundles sem publicar.

## Ferramentas iniciais

Ponto: `registrar_ponto`, `consultar_pontos`, `consultar_ajustes_banco_horas` e `registrar_ajuste_banco_horas`.

Gastos: `consultar_movimentacoes`, `resumo_movimentacoes`, `registrar_movimentacao`, `editar_movimentacao`, `marcar_pagamento` e `excluir_movimentacao`.

Os valores monetários são tratados em centavos inteiros. As ferramentas validam datas, limites, IDs e inputs antes das consultas; o nome de tabela mensal é derivado apenas de um mês validado e valores são enviados por parâmetros SQL.

## Organização do código

```text
src/contracts/       contratos locais das ferramentas liberadas
src/host/             configuração e roteamento do host
src/servers/ponto/    servidor e serviços do domínio Ponto
src/servers/gastos/   servidor e serviços do domínio Gastos
src/shared/           autenticação e contratos D1 compartilhados
tests/                testes com D1 em memória e dados sintéticos
```
