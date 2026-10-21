---
name: revisao-e-testes
description: Use quando o usuário pedir auditoria técnica de código, revisão de pull request, análise de segurança e regressões, cobertura de testes ou verificação de uma entrega. Não use para diagnosticar um bug específico já observado nem para responder perguntas técnicas simples.
---

# Revisão técnica, auditoria e testes

Verifique evidências antes de declarar um projeto aprovado. A revisão pode ser somente leitura ou fazer parte de uma implementação autorizada.

## Fluxo

1. Identifique repositório, branch, mudanças, requisitos e escopo autorizado.
2. Confira código, configurações, testes existentes e histórico relevante; não avalie arquivos que não foram consultados como se tivessem sido lidos.
3. Procure problemas por prioridade: segurança/segredos, integridade dos dados, erros funcionais, regressões, desempenho e manutenção.
4. Execute os testes disponíveis, incluindo casos de borda; se houver interface, acrescente validação visual quando houver navegador/captura.
5. Apresente achados reproduzíveis com gravidade, evidência e correção proporcional. Diga quais testes passaram e quais não puderam ser executados.
6. Se o pedido é só de auditoria, **não edite**. Se há autorização para corrigir, resolva achados no escopo e valide novamente.

**Limite:** não confunda CI verde com comportamento integralmente validado. Não instale bibliotecas independentes sem autorização.
