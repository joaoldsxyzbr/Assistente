# Plano de implementação

A fundação inicial foi integrada à `main` pelo [PR #2](https://github.com/joaoldsxyzbr/Assistente/pull/2). O plano segue acompanhado na [GitHub Issue #1](https://github.com/joaoldsxyzbr/Assistente/issues/1).

## Etapas

- [x] Definir responsabilidades: plugin `Assistente Geral` mantém as regras conversacionais e skills; o Worker Assistente agrega e roteia contratos aprovados; MCPs especialistas validam operações e acessam seus próprios dados.
- [x] Registrar decisões: Assistente como host, MCPs separados por domínio e bancos existentes preservados.
- [x] Criar catálogo, configuração e roteamento do host com nomes de ferramentas qualificados.
- [x] Inspecionar schemas e índices dos D1s e bindings do Worker atual, sem ler registros pessoais.
- [x] Implementar Ponto e Gastos como Workers independentes, cada um com um binding ao seu D1 existente.
- [x] Validar operações de domínio, confirmar duplicatas prováveis e tratar respostas incertas sem repetir escritas automaticamente.
- [x] Criar schemas locais allowlist para o host; não publicar ferramentas genéricas de execução.
- [x] Adicionar testes com D1 em memória e dados sintéticos.
- [x] Validar typecheck, testes e builds dry-run dos três Workers na CI do PR.
- [x] Corrigir Workers Builds do host para usar o arquivo Wrangler explícito e enviar versões sem ativá-las em produção.
- [ ] Implementar OAuth 2.1 entre ChatGPT, pelo plugin `Assistente Geral`, e o host, com authorization code + PKCE e renovação de sessão.
- [ ] Conectar o endpoint do host ao plugin `Assistente Geral` e validar o fluxo OAuth no ChatGPT.
- [ ] Atualizar as skills de Ponto e Gastos no `Assistente Geral` para usar as ferramentas do host, preservando as regras conversacionais e removendo acessos diretos anteriores somente depois da validação ponta a ponta.
- [ ] Configurar `assistente.joaolds.xyz.br` como domínio customizado do Worker host e validar DNS/TLS.
- [ ] Configurar credenciais de API distintas do host para os MCPs de Ponto e Gastos.
- [ ] Publicar os três Workers com secrets distintos e validar as conexões via MCP Inspector, começando por leituras.
- [ ] Criar o API Token dedicado `Assistente Cloudflare` com permissões mínimas e guardá-lo no runtime do componente MCP Cloudflare que chama a API; definir separadamente a credencial host→MCP.
- [ ] Especificar contratos e permissões antes de adicionar Cloudflare MCP e DeskPilot ao catálogo do host.
- [ ] Adicionar consultas compostas que leiam domínios em paralelo quando o fluxo do host estiver conectado.

## Critério para operações reais

Antes de conectar o host ao plugin, configurar URLs HTTPS e secrets no runtime e testar a autenticação. A primeira verificação operacional deve começar por chamadas de leitura; as escritas já têm validações e confirmação para duplicatas e exclusões, mas ainda precisam de validação no MCP Inspector antes da publicação.

Até esta etapa, não houve deploy, leitura de registros pessoais nem alteração de dados/schema nos D1s.

CI aprovada no commit de integração `51eaee965f9541b842a034cebca04ffc050bf66d` e também após o merge na `main` (typecheck, testes e Wrangler dry-run dos três Workers).
