---
name: desenvolvimento-orientado-a-testes
description: Use quando for implementar comportamento testável, corrigir regressão ou refatorar lógica e houver condições de escrever teste automatizado. Aplique TDD RED GREEN REFACTOR antes de código novo; não force o fluxo para documentação, protótipos descartáveis ou ajustes puramente visuais.
---

# Desenvolvimento orientado a testes (TDD)

Em código com comportamento verificável, siga **RED → GREEN → REFACTOR**. A meta é demonstrar que o teste realmente detecta o defeito ou requisito, sem instalar frameworks independentes desnecessários.

## RED — primeiro um teste que falha

1. Identifique um único comportamento observável e a entrada que demonstra o esperado, inclusive caso negativo.
2. Escreva teste pequeno com as ferramentas existentes. Preferência por testes nativos (`node:test`, Python `unittest`, estruturas oficiais do stack).
3. Execute o teste **antes** da mudança de produção. Confirme que falha pelo motivo correto (não erro de import, ambiente ou sintaxe). Se já passar, melhore o cenário.

## GREEN — implementação mínima

4. Altere apenas o suficiente para que o teste passe. Não refatore áreas relacionadas por impulso.
5. Reexecute o teste e verifique o status/saída. Corrija a implementação, não enfraqueça a assertiva.

## REFACTOR — melhoria segura

6. Refatore somente após GREEN, mantendo resultados e sem expandir o escopo.
7. Rode suite relevante e, quando possível, a suite completa. Inclua limites, permissões e regressões importantes.

## Exceções e limites

- Para configuração, documentação, explorações descartáveis ou UI não automatizável, aplique validação proporcional e registre o motivo; não finja um ciclo RED.
- Se o ambiente não executar testes, entregue o teste e **declare que RED/GREEN não foi verificado**.
- Um teste verde isolado não comprova sistema funcional; use `verificacao-de-entrega` antes de afirmar conclusão.

**Evidência mínima:** nome do teste, comando do RED e falha esperada, comando GREEN e sucesso observado, regressões executadas.
