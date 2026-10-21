---
name: roteamento
description: Use quando o usuário pedir explicitamente para melhorar ou analisar o roteamento de skills e especialistas, ou solicitar uma operação que precise coordenar diferentes integrações e áreas, como GitHub mais Cloudflare. Não use para saudações, pedidos técnicos de uma única área ou tarefas cotidianas.
---

# Assistente — coordenação seletiva

Esta skill **não** é executada antes de todo pedido. A plataforma descobre skills por seus nomes e descrições. Escolha diretamente a skill focada quando um único objetivo estiver claro.

## Quando usar

- Auditoria, evolução ou teste do próprio mecanismo de seleção de skills.
- Pedido realmente misto que requer coordenação entre ferramentas ou especialidades distintas, em ordem e com validação.

## Quando não usar

- Conversas simples e perguntas diretas: responda sem consulta a ferramentas desnecessárias.
- Implementação de código: `desenvolvimento`.
- Bugs/erros: `depuracao`.
- Planos técnicos complexos: `planejamento-tecnico`.
- Auditorias, PRs e cobertura de testes: `revisao-e-testes`.
- Layouts, telas e dashboards: `ux-ui`.
- Tom, preferências e instruções pessoais: `instrucoes-e-comportamento`.
- Pesquisa, arquivos, imagens, previsão ou dados pessoais: use os recursos adequados sem inventar capacidades.

## Execução

1. Identifique o resultado real usando o contexto. Não classifique só por palavras como “site”, “banco” ou “visual”.
2. Prefira **uma única skill principal**. Em tarefas multifase, ative uma skill de processo somente quando ela acrescentar valor e depois a execução necessária.
3. Conhecendo a ferramenta e o esquema, chame-a diretamente; faça descoberta seletiva apenas quando for indispensável. Não liste MCPs por hábito.
4. Para GitHub e Cloudflare, siga a ordem dependente da tarefa, confirme o retorno de uma etapa antes da seguinte e preserve autorização, segurança e separação de ambientes.
5. Não leia todos os métodos, não anuncie o roteamento sem necessidade e não transforme um ajuste simples em processo extenso.
6. Informe claramente o que foi concluído, o que foi testado e o que depende de validação externa.

**Limite:** a descoberta de skills depende do ChatGPT. Este texto não intercepta todas as conversas nem garante ativação universal. Preferências gerais devem permanecer nas instruções personalizadas do usuário.
