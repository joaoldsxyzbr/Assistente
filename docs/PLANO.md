# Plano de implementação

Plano rastreado em [GitHub Issue #1](https://github.com/joaoldsxyzbr/Assistente/issues/1).

## Etapas

- [x] Registrar decisões: Assistente como host; MCPs separados por domínio; preservar bancos existentes.
- [x] Criar o núcleo de configuração, descoberta e roteamento independente por servidor.
- [x] Cobrir isolamento, falha parcial, nomes conflitantes e timeout após possível escrita.
- [ ] Confirmar endpoints MCP, autenticação e schemas atuais de ponto e gastos.
- [ ] Integrar ponto e gastos sem migração ou escrita de dados durante configuração.
- [ ] Adicionar chamadas compostas com execução paralela de leituras independentes.
- [ ] Definir implantação dos Workers e bindings de menor privilégio por domínio.
- [ ] Adicionar autenticação compatível com os mecanismos reais de cada MCP e validar no MCP Inspector.
- [ ] Acompanhar CI e validar a implantação quando credenciais e destino estiverem prontos.

## Critério para iniciar operações reais

Antes de habilitar leitura ou escrita em dados reais, confirmar o endpoint, o fluxo de autenticação e os schemas publicados por cada servidor. Para escritas, cada MCP deve oferecer validação, idempotência e forma de consultar o resultado final.
