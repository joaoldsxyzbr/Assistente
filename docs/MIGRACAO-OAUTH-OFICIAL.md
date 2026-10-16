# Arquitetura alvo — MCPs oficiais com OAuth

Status: **migração planejada; produção anterior preservada até a validação**.

## Decisão definitiva

Este projeto passa a ser a **fonte de instruções (skills)**. Não há motivo para manter uma camada MCP personalizada de ponto e gastos.

- GitHub: o ChatGPT conecta **diretamente** ao MCP oficial GitHub com OAuth autorizado pelo usuário.
- Cloudflare: o ChatGPT conecta **diretamente** ao MCP oficial Cloudflare com OAuth autorizado pelo usuário.
- Ponto: `skills/ponto/SKILL.md` descreve comandos, regras, SQL seguro e destino D1 canônico. O **MCP oficial da Cloudflare** é o único executor das consultas/escritas.
- Gastos: `skills/gastos/SKILL.md` descreve comandos, validação, regras de concorrência e destino D1 canônico. O **MCP oficial da Cloudflare** executa as operações.
- Desenvolvimento: `skills/desenvolvimento/SKILL.md` documenta boas práticas e uso do GitHub MCP oficial.

```text
ChatGPT ├─ MCP GitHub oficial (OAuth) ──> GitHub
        └─ MCP Cloudflare oficial (OAuth) ──> Cloudflare D1
                  ↑
       skills Markdown de ponto, gastos e desenvolvimento
```

**Skills não executam código, não carregam tokens e não fornecem permissões.** Os IDs de bancos são identificadores, não credenciais. É necessário conceder acesso no OAuth oficial e selecionar ferramentas permitidas.

## Migração incremental sem interromper dados

1. Conectar GitHub e Cloudflare oficiais no ChatGPT por OAuth e verificar acesso de **leitura** aos D1 corretos e ao repositório.
2. Adaptar as duas skills de ponto e gastos para usar as ferramentas disponibilizadas pelo MCP oficial, diretamente, sem passar pelo Worker. Preservar formatos, horários, regras dos sábados, validação, idempotência e confirmação de gravação.
3. Validar manualmente os comandos em leituras não destrutivas; comparar resultados com a implementação anterior, sem gravar dados reais de teste.
4. Testar escrita somente com autorização explícita e registro verdadeiro solicitado. Não usar dados fictícios em D1 real.
5. Após confirmação do funcionamento das skills pelo ChatGPT, retirar do repositório os módulos Worker/OAuth, proxy e ferramentas locais que se tornaram redundantes, seus testes e a configuração de deploy; não fazer deploy que apague o endpoint antigo prematuramente.
6. Atualizar README, CI e documentação como projeto somente de skills. Só então desativar o Worker e revogar os secrets antigos com segurança.

## Observações importantes

- Esta **branch ainda não implementa a remoção do Worker**, para evitar interrupção do ponto/gastos antes da confirmação do acesso oficial.
- Skills em Markdown no GitHub **não são instaladas automaticamente no ChatGPT**. Precisam estar em instruções acessíveis ao cliente, projeto ou mecanismo de skills suportado. A instalação/carregamento deve ser verificada no cliente.
- Conexões OAuth do GitHub e Cloudflare exigem ação de autorização do proprietário; não é possível simular a autorização apenas editando GitHub.
- Sem Worker personalizado, não há razão para manter `MCP_CLOUDFLARE_TOKEN`, `MCP_GITHUB_TOKEN` ou `ASSISTENTE_OAUTH_PASSWORD` **neste repositório** após a retirada final.
- Não declarar "migração completa" enquanto não houver teste real de leitura e escrita por cada integração autorizada.

## Fontes

- [GitHub MCP oficial](https://github.com/github/github-mcp-server)
- [Cloudflare MCP oficial](https://developers.cloudflare.com/agents/model-context-protocol/)
- [Ferramentas D1 via API Cloudflare](https://developers.cloudflare.com/api/resources/d1/)
