# Arquitetura

## Modelo

```text
ChatGPT ─── GitHub MCP oficial (OAuth) ── GitHub
        └── Cloudflare MCP oficial (OAuth) ── D1
                    ↑
        Skills em Markdown neste repositório
```

Não existe servidor MCP customizado, Worker hospedado, segredo ou cliente HTTP próprio **no código desta branch**. Skills são procedimentos: não executam nem autorizam acesso sozinhas.

## Responsabilidades

- **GitHub MCP oficial:** arquivos, branches, PRs e CI, conforme permissões concedidas pelo usuário.
- **Cloudflare MCP oficial:** consultas e atualizações D1, com OAuth e validação explícita de conta e IDs.
- **Skill ponto:** horários em America/Sao_Paulo, quatro batidas de segunda a sexta e duas aos sábados, consultas em `banco_horas` e `resumo`, registro condicional, confirmação e reconciliação; detalhes em `skills/ponto/SQL.md`.
- **Skill gastos:** padrão próximo mês, tabela mensal `movimentacoes_MM_AAAA`, centavos inteiros, bloqueio de duplicatas, atualizações condicionadas e ausência de criação de tabela em consultas; detalhes em `skills/gastos/EXECUCAO.md`.
- **Skill desenvolvimento:** práticas de implementação proporcional, testes, revisão, GitHub CI e validação de deploys.

## Segurança

Os identificadores canônicos estão nas skills; são dados de roteamento, não credenciais. Não manter tokens ou dados pessoais no Git. O MCP oficial é responsável pela autenticação OAuth; ChatGPT só pode agir dentro das permissões da conexão. Não executar operações destrutivas para testar.

## Ativação

Conectar os dois MCPs oficiais pelo ChatGPT, instalar ou consultar as skills e validar primeiro acesso em leitura. O serviço antigo pode continuar implantado até conclusão da transição, mas não deve ser usado como fluxo novo. Cloudflare Workers Builds vinculado ao repositório precisa ser desativado separadamente para impedir deploys a partir de uma base agora sem Worker.

Acompanhe o checklist e a reversão em [MIGRACAO-OAUTH-OFICIAL.md](MIGRACAO-OAUTH-OFICIAL.md).
