---
name: roteamento
description: Use somente quando o usuário pedir analisar o roteamento de skills ou coordenar operação realmente multidisciplinar entre integrações como GitHub e Cloudflare. Não use para saudações, correção de bug, TDD, planejamento, revisão, UX, execução isolada ou perguntas cotidianas.
---

# Assistente — roteamento seletivo

**A descoberta de skills é responsabilidade do ChatGPT.** Este arquivo não intercepta mensagens nem atua como pré-requisito de toda resposta. Para cada pedido escolha a skill mais específica e carregue auxiliares apenas quando agregarem valor.

## Preferências de seleção

| Objetivo | Skill principal |
| --- | --- |
| Bug, erro 500, teste falhando | `depuracao` |
| Especificação ainda indefinida | `descoberta-de-requisitos` |
| Arquitetura, plano de várias etapas | `planejamento-tecnico` |
| Implementação de código | `desenvolvimento` |
| Ciclo de teste falhando antes do código | `desenvolvimento-orientado-a-testes` |
| Executar plano já definido | `execucao-de-planos` |
| Auditoria e revisão de PR | `revisao-e-testes` |
| Avaliar comentário de revisão | `revisao-de-feedback` |
| Provar que a entrega está concluída | `verificacao-de-entrega` |
| PR, merge, tag, release | `integracao-de-branches` |
| Layout, dashboard, interação | `ux-ui` |
| Instruções, comportamento e preferências | `instrucoes-e-comportamento` |

## Coordenação

1. Defina a intenção e a restrição **pelo contexto**, não por palavras isoladas.
2. Prefira **uma** skill principal. Combine etapas (planejar → implementar → verificar → integrar) apenas para tarefas que realmente exigem esse processo.
3. Para GitHub + Cloudflare, confirme estado de uma integração antes de operar a outra. Descubra ferramentas sob demanda e evite listar capacidades por hábito.
4. Em pedidos de leitura/auditoria, não escreva. Em produção ou mudanças destrutivas, respeite autorização.
5. Não faça chamadas a MCPs em saudações, perguntas simples, mídia ou documentos sem ligação com esses serviços.
6. Nunca alegue uso de subagentes, testes ou ferramentas que o ambiente não ofereça.

## Limite

A descrição da skill melhora a chance de seleção, mas não garante ativação automática nem permite medir a seleção real sem testes no host.
