---
name: depuracao
description: Use quando houver bug, erro 500, teste quebrado, falha intermitente, regressão, exceção ou comportamento inesperado para investigar a causa raiz antes de corrigir. Não use para criar uma função nova sem defeito observado.
---

# Depuração sistemática — evidência antes da correção

O objetivo é **encontrar e confirmar a causa raiz** e só então corrigir. Não resolva sintomas por tentativa e erro. Use `desenvolvimento-orientado-a-testes` para regressões testáveis e `verificacao-de-entrega` antes de declarar o bug resolvido; sem carregar métodos irrelevantes.

## Etapas e evidências

1. **Definir sintoma:** comportamento observado, esperado, ambiente, impacto e passos reproduzíveis; use o contexto já fornecido.
2. **Localizar a falha:** leia erro, stack trace, logs e últimas mudanças. Em sistemas distribuídos, verifique cada fronteira (UI → Worker → API → D1) por observações concretas, sem expor segredos nem dados pessoais.
3. **Hipótese única:** compare com um caso que funciona; formule hipótese falsificável, incluindo a evidência que a confirmaria ou descartaria.
4. **Teste mínimo:** reproduza em ambiente seguro, alterando uma variável por vez. Se não reproduzir, amplie diagnóstico em vez de inventar a causa.
5. **Regressão:** quando testável, crie teste que falhe pelo defeito antes de editar o código de produção; confirme que a falha é a correta.
6. **Correção mínima:** ajuste a origem do problema, não apenas a mensagem. Não faça refatoração paralela.
7. **Verificação:** execute o teste original, testes relacionados e, se pertinente, validação visual/navegador. Procure impactos entre componentes.

## Quando interromper a tentativa de correção

- Se a hipótese não se confirmar, volte aos fatos antes de outra alteração.
- Depois de repetidas tentativas fracassadas, examine a arquitetura e dependências em vez de acumular remendos.
- Se o bug envolver produção, dados reais, credenciais ou ação destrutiva, use leitura segura e peça aprovação específica quando necessária.

## Entrega

Informe **causa raiz confirmada ou hipótese pendente**, arquivos alterados, comando/teste executado, resultados observados e risco residual. Sem reproduzir ou testar, não declare "corrigido".
