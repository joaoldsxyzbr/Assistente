# Arquitetura

```text
ChatGPT ─── Assistente MCP (Worker Cloudflare, OAuth próprio) ─── skills Markdown
        ├── GitHub MCP oficial (OAuth direto) ──────────────── GitHub
        └── Cloudflare MCP oficial (OAuth direto) ──────────── D1/Workers
```

## Responsabilidades

- **Worker Assistente:** autenticar o cliente ChatGPT, publicar somente `assistente_status` e `assistente_skill`; não encaminhar chamadas, não executar SQL, não gerir OAuth dos outros MCPs.
- **GitHub oficial:** repositórios, PRs, commits e CI com permissões do OAuth concedido no ChatGPT.
- **Cloudflare oficial:** D1, Workers e logs com permissões do OAuth concedido no ChatGPT.
- **Skills:** instruções de ponto, gastos e desenvolvimento. Não executam código, não são credenciais e não guardam dados pessoais.

## Autenticação

`ASSISTENTE_OAUTH_PASSWORD` e `OAUTH_KV` permanecem para autenticação do nosso Worker. Não existem secrets de API GitHub ou Cloudflare para o proxy, pois ele foi retirado. OAuth do cliente para cada integração é independente e não pode ser repassado automaticamente para o Worker.

## Regras de segurança

As skills de ponto e gastos registram IDs D1 distintos e especificam banco canônico. Consultas e escritas são feitas somente com o MCP oficial Cloudflare, validando banco, autorização, parâmetros, retorno e duplicidade. Não repetir escritas incertas antes da conciliação.

## Entrega

GitHub é fonte de verdade. Executar `npm run check` e validar CI antes de promover versão no Worker. Não reutilizar D1 real na preview. A nova arquitetura não exige apagar o Worker nem o domínio existente.
