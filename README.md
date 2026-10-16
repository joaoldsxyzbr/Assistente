# Assistente MCPs — Skills

Repositório de **instruções (skills)** para uso dos **MCPs oficiais GitHub e Cloudflare**, conectados diretamente ao ChatGPT com OAuth. **Não hospeda servidor MCP, Worker, proxy, credenciais ou banco de dados.**

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `skills/ponto/SKILL.md` | Controle de ponto no D1 via Cloudflare oficial |
| `skills/ponto/SQL.md` | Consultas e escritas atômicas de referência |
| `skills/gastos/SKILL.md` | Controle financeiro pelo Cloudflare oficial |
| `skills/gastos/EXECUCAO.md` | Rotina de referência para D1 |
| `skills/desenvolvimento/SKILL.md` | Processo de desenvolvimento e GitHub |
| `skills/INSTRUCTIONS.md` | Orientações resumidas para o projeto ChatGPT |
| `tests/` | Verificação local das skills, referências e segurança |
| `docs/` | Arquitetura, migração e histórico |

## Conectar no ChatGPT

1. Adicione/ative a conexão **GitHub oficial**, faça login com OAuth e autorize as permissões desejadas.
2. Adicione/ative a conexão **Cloudflare oficial**, faça login com OAuth e autorize acesso à conta e aos bancos D1 apropriados.
3. Coloque as instruções de `skills/INSTRUCTIONS.md` nas **instruções do projeto ChatGPT** e use as skills `SKILL.md` como referência consultável no repositório.
4. Teste primeiro `ponto hoje`, `ponto resumo` e `gastos resumo` (somente leitura). Testes de escrita exigem um registro **real solicitado**; nunca use dados fictícios no D1 pessoal.

**Limitação:** arquivos Markdown no GitHub não são injetados automaticamente em todas as conversas do ChatGPT. O cliente precisa ter acesso ao arquivo ou às instruções instaladas. Este repositório não publica ferramentas `ponto_*` ou `gastos_*`: os comandos são orientações para o MCP Cloudflare oficial.

## Bancos e segurança

- Ponto: `96b39cda-f037-4259-b406-09fea5431469`.
- Gastos: `0c6c31c2-f2fd-4f60-9c75-b232019ae63f`.
- Conta: `924f32dc9eeb8946dc033801c0c17c42`.

IDs identificam recursos, mas não concedem permissão. As skills guardam apenas regras, **nunca** dados pessoais, tokens ou segredos. Executar operações somente na conta/banco confirmado via OAuth; escritas exigem validação e reconciliação para evitar repetição.

## Validação

```bash
npm ci
npm run check
```

A suíte usa Node.js nativo e **não instala dependências**. GitHub Actions executa os checks em PRs e na `main`.

## Desativação do serviço antigo

A migração do código **não** apaga recursos remotos automaticamente. Se houver um Worker `assistente` existente e Cloudflare Workers Builds vinculado ao repositório, sua desativação deve ser feita **separadamente** e **depois** da validação do OAuth oficial. Não confunda merge no GitHub com deploy. Para detalhes e rollback consulte [docs/MIGRACAO-OAUTH-OFICIAL.md](docs/MIGRACAO-OAUTH-OFICIAL.md).

## Fonte de verdade

Todos os procedimentos e alterações ficam neste repositório: `joaoldsxyzbr/Assistente-mcps`. Simplicidade e clareza acima de tudo.
