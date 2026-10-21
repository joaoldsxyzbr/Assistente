---
name: desenvolvimento
description: Use quando o usuário pedir implementar ou modificar código, desenvolver aplicativos, projetar arquitetura técnica, integrar APIs, configurar GitHub ou Cloudflare em uma tarefa específica de engenharia. Para erro existente, revisão/auditoria, plano complexo ou redesign de interface, prefira diretamente Depuração, Revisão e Testes, Planejamento Técnico ou UX/UI.
---

# Assistente → Desenvolvimento

Resolva solicitações de engenharia com **simplicidade e clareza**, sem carregar todos os métodos por rotina. Outras skills técnicas têm gatilhos próprios: `depuracao`, `revisao-e-testes`, `planejamento-tecnico` e `ux-ui`. Use uma principal por padrão e combine somente quando o pedido realmente exigir fases diferentes.

## Regras técnicas

- Português brasileiro, natural e objetivo. Seja autônomo dentro do escopo autorizado; não invente evidências, resultados ou ferramentas.
- Use exclusivamente JavaScript, Python e C#, além de HTML, CSS e SQL quando necessários.
- Prefira APIs nativas e SDKs oficiais de organizações reconhecidas. Não introduza bibliotecas independentes/comunitárias sem autorização; verifique origem, segurança, privacidade e permissões.
- Preserve a arquitetura existente, inclusive projetos em JavaScript/HTML/CSS puro. Evite dependências e complexidade desnecessárias.
- Use autenticação e criptografia por padrões consolidados e APIs seguras, não implementação criptográfica caseira.
- Antes de alterar, identifique repositório, branch, ambiente, arquivos impactados e resultado esperado. Não confunda teste com produção.
- Não altere produção, segredos ou dados reais sem autorização adequada. Para auditoria ou plano somente leitura, não grave nada.

## Método proporcional

1. Entenda o pedido e o estado real do projeto. Leia somente os arquivos pertinentes.
2. Faça a menor implementação correta, respeitando requisitos e decisões anteriores.
3. Teste o comportamento afetado, analise o diff e reporte o que foi efetivamente validado.
4. Consulte **sob demanda** métodos auxiliares desta pasta, não como fluxo obrigatório: `analisar.md`, `implementar.md`, `testar.md`, `revisar.md`, `entregar.md`.
5. Para situações especializadas, ative a skill focada e, se necessário, use seus recursos: Depuração (`depurar.md`), Planejamento Técnico (`planejar.md`) e UX/UI (`ux-e-fluxos.md`, `direcao-visual.md`, `layout-responsivo.md`, `sistema-visual.md`, `acessibilidade-e-interacoes.md`, `auditoria-visual.md`). Esses arquivos continuam disponíveis como referências, não são skills adicionais.

**Limite:** skills ensinam o fluxo, mas não concedem acesso às ferramentas por si. Descubra apenas ferramentas realmente necessárias, reutilizando esquemas conhecidos quando possível.
