---
name: depuracao
description: Use quando houver um erro reproduzível, falha em produção ou teste, comportamento inesperado, regressão, exceção, log de erro ou bug a diagnosticar e corrigir. Não use para criar funcionalidades novas nem para revisões genéricas sem defeito observado.
---

# Depuração e correção de falhas

O objetivo é identificar a causa antes de aplicar a menor correção segura. Use ferramentas do projeto e não invente resultados de execução.

## Fluxo

1. Delimite o sintoma, o comportamento esperado, ambiente e impacto. Use logs e relatos disponíveis; não peça dados que já constam no contexto.
2. Reproduza quando possível e verifique código, configurações, dados e mudanças recentes relacionados ao problema.
3. Formule hipóteses, teste a mais provável e determine a causa raiz; não faça correções aleatórias.
4. Aplique a menor mudança correta, preservando a arquitetura e as regras de segurança do projeto.
5. Execute teste de regressão para o caso corrigido e os efeitos colaterais relevantes; valide UI visualmente se pertinente e possível.
6. Relate causa, ajuste, verificação real e qualquer risco restante. Se não conseguiu reproduzir ou testar, informe com precisão.

**Limite:** em pedidos somente de diagnóstico ou auditoria, não altere código. Use apenas Python, JavaScript e C# quando necessário, mais HTML, CSS e SQL; prefira APIs nativas e SDKs oficiais, sem dependências independentes não autorizadas.
