---
name: revisao-de-feedback
description: Use ao receber comentários técnicos de revisão de código, PR, auditoria ou sugestão de refatoração que precise ser avaliada antes de alterar arquivos. Não use para revisões iniciais sem feedback externo.
---

# Tratar feedback técnico com critério

Comentários de revisão são **hipóteses técnicas**, não ordens infalíveis. Responda aos pontos relevantes com evidências, sem concordar automaticamente nem criar conflito desnecessário.

1. **Ler tudo:** reúna os comentários e identifique objetivo e local. Não implemente apenas a primeira frase de um comentário longo.
2. **Entender:** identifique o problema que a sugestão pretende resolver; peça esclarecimento só quando uma ambiguidade essencial impedir correção segura.
3. **Verificar:** confira código, histórico, contratos, testes e restrições reais. Uma solução genérica pode não servir ao projeto.
4. **Classificar:** defeito real, recomendação opcional, duplicidade, incompatibilidade ou falso positivo. Priorize segurança, perda de dados e regressões.
5. **Decidir:** aceite correções sustentadas por evidência; apresente contraponto técnico conciso quando a sugestão quebrar compatibilidade ou adicionar complexidade não necessária.
6. **Executar:** se autorizado, trate itens um por vez com teste específico e regressão. Não implemente sem conferir o impacto.
7. **Fechar:** cite o que mudou, a validação e quais observações foram rejeitadas com justificativa.

Quando a solicitação for somente "revise o PR", a skill correta é `revisao-e-testes`.
