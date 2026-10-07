# Arquitetura do Assistente

## Papel do projeto

O Assistente é o host e coordenador. Ele conecta clientes MCP separados, escolhe os servidores necessários para cada solicitação e pode combinar respostas. Cada MCP continua responsável pelo seu próprio domínio.

```text
ChatGPT / cliente do Assistente
└── Assistente (host)
    ├── Ponto MCP ─── banco atual de ponto
    ├── Gastos MCP ── banco atual de gastos
    ├── Cloudflare MCP ── API Cloudflare
    └── DeskPilot MCP ─── serviço do DeskPilot
```

## Limites

- O Assistente não copia nem migra os bancos atuais.
- Cada conexão tem URL e credencial próprias, vindas do ambiente.
- Um MCP não recebe credenciais nem acesso direto ao banco de outro MCP.
- O host encaminha cada chamada para somente um servidor. Resumos entre domínios são compostos no host.
- Falha de um servidor não derruba a descoberta dos demais.
- Escritas não são repetidas automaticamente após timeout; o resultado pode ser incerto e precisa de reconciliação/idempotência no domínio.
- Mensagens de status não incluem endpoints, tokens ou detalhes de exceções remotas.

## Primeira fatia implementada

O núcleo TypeScript lê configurações independentes, conecta clientes MCP por HTTP Streamable, descobre ferramentas com nomes qualificados por domínio e encaminha chamadas ao servidor escolhido. O protocolo é usado pelo SDK oficial do MCP; o host não implementa JSON-RPC manualmente.

O código não contém URLs, tokens, bindings D1 nem schemas dos bancos. As conexões reais só são ativadas depois que os endpoints e a autenticação existentes forem configurados como secrets. Nenhum dado de produção é alterado nesta etapa.

## Configuração

Cada servidor usa um par próprio de variáveis:

| Servidor | Endpoint | Token bearer |
|---|---|---|
| Ponto | `MCP_PONTO_URL` | `MCP_PONTO_TOKEN` |
| Gastos | `MCP_GASTOS_URL` | `MCP_GASTOS_TOKEN` |
| Cloudflare | `MCP_CLOUDFLARE_URL` | `MCP_CLOUDFLARE_TOKEN` |
| DeskPilot | `MCP_DESKPILOT_URL` | `MCP_DESKPILOT_TOKEN` |

Os endpoints remotos precisam usar HTTPS. Credenciais, query strings e fragmentos dentro da URL são recusados. OAuth e outros mecanismos de autenticação entram como adaptadores próprios quando os contratos reais forem confirmados.

## Organização de código

```text
src/host/       configuração, catálogo, contratos e roteador
tests/          testes do roteamento, isolamento e estados de falha
docs/           decisões e etapas do projeto
```

O repositório pode permanecer único; os serviços MCP continuam com limites lógicos e de permissão próprios. Quando o destino de implantação for definido, cada domínio com dados ou segredos distintos terá implantação e bindings próprios.
