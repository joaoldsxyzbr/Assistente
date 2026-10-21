# Roteamento do plugin Assistente (v1.0.4)

A skill de roteamento não é uma passagem obrigatória. O objetivo é encaminhar a tarefa correta com mínimo de leituras e chamadas.

| Pedido representativo | Comportamento pretendido |
| --- | --- |
| "Oi, tudo bem?" | Resposta direta, sem consultar GitHub, Cloudflare ou abrir skills |
| "Corrija o bug no site" | Desenvolvimento e somente métodos necessários |
| "Deixe o dashboard mais profissional" | Desenvolvimento, métodos UX/UI relevantes |
| "Ajuste meu tom de resposta" | Instruções e Comportamento |
| "Altere o código no GitHub e publique o Worker" | Roteamento para coordenar GitHub e Cloudflare, com validação e permissões |
| "Me diga o que foi lançado hoje" | Pesquisa/recursos adequados, sem chamar MCPs técnicos por rotina |
| "Meus gastos do mês" | Somente ferramenta de dados efetivamente conectada; não inventar D1 |
| "Melhore o roteamento das skills" | Roteamento (metatarefa) |

## Critérios
- Um especialista por padrão; combinação apenas para tarefas genuinamente mistas.
- Não acionar roteamento para saudações nem perguntas simples.
- Sem descoberta geral de ferramentas quando uma chamada específica já é conhecida.
- Nunca tratar skills como APIs nem assumir ativação obrigatória.
- Frontmatter é o principal contrato de descoberta de skill, conforme a documentação de plugins da OpenAI.

## Como validar
O CI verifica a presença, frontmatter e invariantes do contrato de roteamento. **Isso não equivale a um teste comportamental do modelo.** Para validar o comportamento, atualizar a versão do plugin no ChatGPT e aplicar as solicitações representativas, observando qual skill é selecionada e se as chamadas desnecessárias foram evitadas.

Referências: https://developers.openai.com/plugins/build/skills e https://developers.openai.com/plugins/concepts/skills
