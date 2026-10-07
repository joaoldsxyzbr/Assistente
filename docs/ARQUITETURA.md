# Arquitetura do Assistente

## Camadas e responsabilidades

| Camada | Responsabilidade |
|---|---|
| Plugin `Assistente Geral` | Entrada única no ChatGPT; mantém skills, regras conversacionais de domínio, interpretação da intenção e orientação sobre quando consultar, escrever ou pedir confirmação. As skills são mantidas no plugin, fora deste repositório. |
| Worker host `assistente` | Hub técnico: publica apenas contratos aprovados, autentica conexões de serviço e encaminha cada ferramenta ao MCP de destino. Não tem binding D1 nem executa as regras conversacionais. |
| MCPs especializados | Expõem operações de cada domínio, validam entradas e invariantes no servidor e acessam somente os dados e secrets daquele domínio. |

As instruções conversacionais têm como fonte canônica o plugin `Assistente Geral`; não devem ser copiadas para o Worker como uma segunda fonte de regras. O código do host mantém somente o catálogo técnico allowlist, os schemas necessários para chamar ferramentas e as proteções de integração. As regras que precisam ser garantidas mesmo fora do chat — como validação, idempotência e limites de escrita — continuam impostas pelo MCP de domínio.

O Assistente agrega e roteia vários MCPs; não substitui os servidores especialistas nem combina credenciais e bancos. Ponto e Gastos já estão separados. Cloudflare MCP e DeskPilot são futuras conexões e só ficarão disponíveis depois que seus contratos e permissões forem definidos.

## Topologia atual

O plugin `Assistente Geral` conecta-se ao host `assistente`. O host encaminha cada chamada aprovada ao servidor de domínio correspondente:

| Servidor | Binding de dados | Estado |
|---|---|---|
| Assistente host | Nenhum | Implementado; ainda não publicado |
| Ponto MCP | Somente `PONTO_DB` | Implementado; ainda não publicado |
| Gastos MCP | Somente `GASTOS_DB` | Implementado; ainda não publicado |
| Cloudflare MCP | Sem contrato local aprovado | Planejado |
| DeskPilot | Sem contrato local aprovado | Planejado |

## Limites e segurança

- Os bancos existentes são preservados; não há migrações nem criação de tabelas.
- O Worker de Ponto tem apenas `PONTO_DB`; o Worker de Gastos tem apenas `GASTOS_DB`; o host não tem binding D1.
- Cada Worker valida um token bearer independente no caminho `/mcp`. Tokens precisam ter no mínimo 32 caracteres e ficam em secrets do runtime.
- O host publica somente ferramentas e schemas declarados no catálogo local. Não repassa execução de código genérica nem descobre permissões implicitamente no MCP remoto.
- O host encaminha cada chamada a um único servidor. Uma falha não impede o uso de outro domínio.
- Escritas não são repetidas automaticamente após falha de rede. Se uma resposta se perder, o host orienta consultar o MCP de origem antes de tentar de novo.
- Respostas de status não expõem endpoints, tokens ou exceções remotas.
- A exclusão de gastos exige `confirmar=true`; ajustes e movimentações repetidos pedem confirmação quando houver correspondência provável.

## Estado da integração

Foram inspecionados somente metadados de schema e índices dos D1s existentes. Nenhum registro pessoal foi lido. O código usa os nomes e estruturas atuais:

- Ponto: tabelas `pontos` e `ajustes_banco_horas`.
- Gastos: tabelas mensais `movimentacoes_MM_AAAA`.

Os MCPs de Ponto e Gastos estão implementados no repositório com acesso ao respectivo binding. Ainda não foram publicados nem chamados contra registros de produção. O Worker existente `cloudflare-mcp` não tinha bindings D1 nem ferramentas de domínio detectadas na inspeção; por isso não é tratado como interface para esses serviços.

## Configuração e autenticação

O domínio planejado do host é `assistente.joaolds.xyz.br`; o endpoint MCP será `https://assistente.joaolds.xyz.br/mcp`. Ele ainda não está ligado ao Worker nem validado por DNS.

Há três relações de credenciais diferentes:

| Origem → destino | Credencial | Local |
|---|---|---|
| ChatGPT / plugin Assistente Geral → host | OAuth 2.1 do usuário | Fluxo planejado; o código atual ainda usa bearer token e não implementa OAuth |
| Host → cada MCP | Credencial de serviço própria para aquele endpoint | Secrets do Worker host; não encaminhar o OAuth do usuário |
| MCP Cloudflare → API da Cloudflare | API Token dedicado `Assistente Cloudflare`, com permissões mínimas | Secret do componente MCP Cloudflare que chama a API; não expor ao ChatGPT nem reutilizar como credencial host→MCP |

O host ainda usa `ASSISTENTE_MCP_TOKEN` para proteger seu endpoint atual. Para os MCPs de Ponto e Gastos, use `MCP_TOKEN` em cada Worker de domínio e configure no host `MCP_PONTO_URL`, `MCP_PONTO_TOKEN`, `MCP_GASTOS_URL` e `MCP_GASTOS_TOKEN`. Os tokens de serviço são distintos e o valor no host corresponde ao secret do MCP de destino.

Cloudflare MCP e DeskPilot ainda não têm contratos de ferramentas no host. Para cada nova integração, defina antes as ferramentas allowlist, schemas, escopo de permissão e secrets do serviço.

Os arquivos `wrangler.ponto.jsonc` e `wrangler.gastos.jsonc` apontam aos IDs dos D1s existentes e dão a cada Worker apenas o seu binding. `wrangler.assistente.jsonc` não declara banco. `npm run build:workers` valida os três bundles sem publicar.

## Ferramentas iniciais

Ponto: `registrar_ponto`, `consultar_pontos`, `consultar_ajustes_banco_horas` e `registrar_ajuste_banco_horas`.

Gastos: `consultar_movimentacoes`, `resumo_movimentacoes`, `registrar_movimentacao`, `editar_movimentacao`, `marcar_pagamento` e `excluir_movimentacao`.

Os valores monetários são tratados em centavos inteiros. As ferramentas validam datas, limites, IDs e inputs antes das consultas; o nome de tabela mensal é derivado apenas de um mês validado e valores são enviados por parâmetros SQL.

## Organização do código

```text
src/contracts/       contratos locais das ferramentas liberadas pelo host
src/host/             configuração e roteamento do hub
src/servers/ponto/    servidor e serviços do domínio Ponto
src/servers/gastos/   servidor e serviços do domínio Gastos
src/shared/           autenticação e contratos D1 compartilhados
tests/                testes com D1 em memória e dados sintéticos
```
