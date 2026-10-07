# Plano de implementação

Plano acompanhado em [GitHub Issue #1](https://github.com/joaoldsxyzbr/Assistente/issues/1) e revisão em andamento no [PR #2](https://github.com/joaoldsxyzbr/Assistente/pull/2).

## Etapas

- [x] Registrar decisões: Assistente como host, MCPs separados por domínio e bancos existentes preservados.
- [x] Criar catálogo, configuração e roteamento do host com nomes de ferramentas qualificados.
- [x] Inspecionar schemas e índices dos D1s e bindings do Worker atual, sem ler registros pessoais.
- [x] Implementar Ponto e Gastos como Workers independentes, cada um com um binding ao seu D1 existente.
- [x] Validar operações de domínio, confirmar duplicatas prováveis e tratar respostas incertas sem repetir escritas automaticamente.
- [x] Criar schemas locais allowlist para o host; não publicar ferramentas genéricas de execução.
- [x] Adicionar testes com D1 em memória e dados sintéticos.
- [x] Validar typecheck, testes e builds dry-run dos três Workers na CI do PR.
- [ ] Publicar os três Workers com secrets distintos e conferir a conexão via MCP Inspector.
- [ ] Definir a autenticação e registrar o endpoint host no cliente ChatGPT escolhido.
- [ ] Especificar contratos e permissões antes de adicionar Cloudflare MCP e DeskPilot.
- [ ] Adicionar consultas compostas que leiam domínios em paralelo quando o fluxo do host estiver conectado.

## Critério para operações reais

Antes de conectar o host a um cliente, configurar URLs HTTPS e secrets no runtime e testar a autenticação. A primeira verificação operacional deve começar por chamadas de leitura; as escritas já têm validações e confirmação para duplicatas e exclusões, mas ainda precisam de validação no MCP Inspector antes da publicação.

Até esta etapa, não houve deploy, leitura de registros pessoais nem alteração de dados/schema nos D1s.

CI aprovada no commit `aaf37724a8b015d0408216ffbf0bd5ce50f15479` (typecheck, testes e Wrangler dry-run).
