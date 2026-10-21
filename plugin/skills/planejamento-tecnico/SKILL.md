---
name: planejamento-tecnico
description: Use quando o usuário pedir um plano de implementação de software, arquitetura nova, migração ou funcionalidade técnica complexa, especialmente antes de começar a codificar. Não use em ajustes triviais, tarefas já planejadas ou pedidos não técnicos.
---

# Planejamento técnico

Use esta skill para decisões e etapas de engenharia que precisam de planejamento real. Não transforme toda correção pequena em projeto.

## Fluxo

1. Confirme objetivo, código/arquitetura existente, escopo, ambiente e restrições. Considere decisões já tomadas, sem perguntar novamente.
2. Identifique o resultado esperado e critérios concretos de aceitação. Separe fatos verificados de hipóteses.
3. Divida em poucas etapas executáveis, identificando dependências, áreas afetadas e ordem segura.
4. Aponte riscos relevantes, validações e reversão quando a mudança puder comprometer produção ou dados.
5. Se o usuário pediu **planejar e executar**, siga para implementação após definir o plano; não peça novo aval para etapas não destrutivas já autorizadas. Se pediu **apenas planejamento**, não faça commits ou deploys.

**Saída:** plano curto e útil, sem documentos longos por padrão. Para implementações triviais, trabalhe diretamente com Desenvolvimento. Não use esta skill em conversas cotidianas.
