---
name: revisao-e-testes
description: Use quando o usuário pedir auditoria técnica, revisão de código ou PR, análise de segurança, cobertura, regressão ou verificar uma entrega existente. Não use para diagnosticar um bug específico já reproduzido nem para implementar função nova.
---

# Revisão técnica baseada em evidências

Revisão é independente de implementação sempre que possível. Não aceite relatórios de outros agentes ou CI verde como prova suficiente de que **todos os requisitos** foram cumpridos.

## Fluxo de revisão

1. **Escopo:** identifique base/head ou arquivos, objetivo, restrições e se a tarefa é apenas leitura. Um pedido de auditoria não autoriza alteração.
2. **Confronto:** compare critérios de aceitação com código real e diferenças de branch; investigue o que mudou e o que não foi testado.
3. **Prioridade:** segurança, autenticação, autorização, exposição de segredos, perda de dados, bugs, integrações, desempenho e manutenção. Informe gravidade por impacto e probabilidade.
4. **Testes:** verifique testes existentes, casos negativos, falhas de validação, limites, idempotência e regressões. Execute os testes permitidos e leia os resultados completos, sem declarar que executou o que não rodou.
5. **UX/UI:** se a entrega envolve interface, verifique responsividade, estados, acessibilidade e capturas reais quando houver navegador.
6. **Feedback verificável:** cite arquivo/trecho e condição de reprodução. Evite impressões vagas. Trate sugestões externas pela skill `revisao-de-feedback` quando aplicável.
7. **Fechamento:** marque bloqueantes, relevantes e melhorias opcionais separadamente. Verifique novamente as correções antes de aprovar um merge.

## Saída

**Achados priorizados → evidências → correções sugeridas → testes executados/não executados → conclusão condicionada aos resultados.** Não confunda lint, CI e comportamento funcional.
