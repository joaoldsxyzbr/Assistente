---
name: verificacao-de-entrega
description: Use antes de declarar bug resolvido, tarefa concluída, PR pronto, deploy funcional ou testes aprovados em uma entrega técnica. Exija evidências atuais de comandos, artefatos e comportamento; não use em conversas simples sem entrega.
---

# Verificação antes de afirmar conclusão

**Evidência antes de afirmação.** Uma edição de código, commit criado ou CI iniciada não prova que a entrega funciona.

## Portão de qualidade

1. **Defina a afirmação:** "testes passaram", "deploy publicado", "bug corrigido" ou "requisito atendido". Para cada uma, identifique evidência específica.
2. **Execute a verificação disponível:** teste relevante, suíte total, comando de build, consulta da branch/PR, leitura de logs, smoke test de API e/ou navegador real. Evite testar com dados reais sem autorização.
3. **Leia a saída:** status, falhas, testes ignorados, artefatos, horário e ambiente. Uma execução antiga ou de outra branch não vale como prova do estado atual.
4. **Compare com critérios:** verifique requisitos funcionais, riscos de segurança, regressões e aparência quando pertinentes; CI verde não valida tudo.
5. **Relate a verdade:** diga o que foi executado e passou, o que falhou, o que não pôde ser testado e qual conclusão esses resultados realmente sustentam.

## Exemplo de conclusão honesta

- "Teste de login passou na branch de desenvolvimento; deploy não realizado."
- "Build validado; não pude conferir o visual no navegador."
- "A mudança foi enviada ao GitHub, mas o Worker ainda não foi atualizado."

Não diga "100%", "funcionando" ou "pronto" sobre uma etapa sem evidência suficiente. Sem ferramenta disponível, informe a limitação em vez de inventar testes.
