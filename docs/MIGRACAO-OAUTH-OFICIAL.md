# Migração para MCPs oficiais com OAuth e sem tokens manuais

Status: **planejada; não ativada em produção**. A migração é incremental. A origem da verdade é `joaoldsxyzbr/Assistente-mcps`.

## Decisão arquitetural

- **GitHub**: usar o MCP oficial diretamente no ChatGPT. O endpoint remoto é `https://api.githubcopilot.com/mcp/`. OAuth depende do cliente/host; o servidor remoto não faz sozinho o login. Não configurar novo PAT no Worker.
- **Cloudflare**: usar a conexão MCP oficial diretamente no ChatGPT, com OAuth oferecido pelo provedor/host. Não repassar token OAuth do ChatGPT ao Worker customizado.
- **Ponto e gastos**: manter ferramentas dedicadas no Worker `assistente`, migrando o acesso ao D1 do `MCP_CLOUDFLARE_TOKEN` para **bindings D1 nativos de Worker** (`PONTO_DB` e `GASTOS_DB`). Preservar nomes, regras, schema, verificações de concorrência, padrão do próximo mês e valores monetários em centavos.
- **Autenticação do Worker personalizado**: permanece OAuth próprio enquanto existir endpoint MCP de ponto/gastos. A senha `ASSISTENTE_OAUTH_PASSWORD` **continua necessária na implementação atual**. A meta de eliminar inclusive esse secret exige migrar o login do próprio Worker para um provedor de identidade, como Cloudflare Access, com autorização e testes separados.

## Fluxo de destino

```text
ChatGPT ── OAuth do provedor ──> MCP oficial GitHub
       ├─ OAuth do provedor ──> MCP oficial Cloudflare
       └─ OAuth do Assistente ──> Worker assistente
                                      ├─ PONTO_DB (binding D1 nativo)
                                      └─ GASTOS_DB (binding D1 nativo)
```

O Worker NÃO intermedeia ferramentas gerais de GitHub nem Cloudflare. Não encaminhar credenciais de uma origem à outra.

## Plano seguro de execução

1. Conectar e testar no ChatGPT os **MCPs oficiais** em modo leitura e depois em operação autorizada. A ligação OAuth requer aprovação interativa do proprietário. Verificar ferramentas concretas antes de aposentar proxy.
2. Declarar bindings D1 no Wrangler com os IDs canônicos já registrados, mantendo `OAUTH_KV`. Implementar adaptador local D1 com `prepare().bind().all()/run()`. Migrar cinco ferramentas de ponto e cinco de gastos sem mudar semântica nem gravar dados de teste reais.
3. Testar em banco sintético isolado: dias úteis/sábado, duplicidade, saldo, pagamentos, criação do próximo mês, valores inválidos, edições/exclusões concorrentes. Nunca conectar preview aos bancos de produção.
4. Quando CI e integração estiverem verdes, remover o proxy oficial duplicado (catálogos GitHub/Cloudflare, cliente HTTP remoto e tokens `MCP_GITHUB_TOKEN` e `MCP_CLOUDFLARE_TOKEN`) e atualizar testes, skills, README e documentação na mesma PR.
5. Validar login OAuth novo do Assistente, leituras e escritas explicitamente autorizadas de ponto/gastos e conexões oficiais; somente então promover Worker para produção. **Não excluir secrets legados antes dessa confirmação.**
6. Separadamente, estudar substituir a senha de login do Assistente por autenticação externa para remover o último secret de autenticação estático. Não declarar “sem secrets” enquanto esse passo não estiver verificado.

## Critérios de aceite

- GitHub e Cloudflare funcionam via conexões oficiais diretas, sem PAT/API token no Worker customizado.
- Ponto/gastos funcionam com bindings D1, mesma interface e invariantes atuais.
- Nenhuma consulta simples cria tabela; nenhuma operação de teste grava D1 real.
- CI GitHub e Cloudflare Preview verdes no mesmo commit, sem promoção automática de tráfego.
- README e skills correspondem ao sistema efetivamente implantado.
- Rollback: manter a versão ativa anterior do Worker, a configuração e os secrets até validação final; revertê-la se for detectada regressão.

## O que não fazer

- Não assumir que OAuth ChatGPT→GitHub/Cloudflare dá automaticamente acesso Worker→provedor.
- Não utilizar `MCP_CLOUDFLARE_TOKEN` como substituto silencioso depois da migração.
- Não colocar credenciais em variáveis `vars` públicas, documentação, commits ou logs.
- Não apagar ferramentas personalizadas de ponto/gastos apenas para reduzir código.
- Não desligar produção nem promover PR sem verificação de compatibilidade.

## Fontes oficiais

- [GitHub MCP — integração com hosts](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md)
- [GitHub MCP — servidor remoto](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)
- [Cloudflare — autorização MCP](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)
- [Cloudflare — D1 Worker bindings](https://developers.cloudflare.com/d1/worker-api/)
