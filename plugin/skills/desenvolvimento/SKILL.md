---
name: desenvolvimento
description: Use quando o usuário pedir implementar ou modificar código, APIs, aplicativos, integração técnica ou arquitetura já definida. Para bugs existentes, planos complexos, auditorias e visual, prefira depuracao, planejamento-tecnico, revisao-e-testes ou ux-ui. Para testes primeiro, use desenvolvimento-orientado-a-testes.
---

# Desenvolvimento — implementação simples e rigorosa

Execute a menor mudança que resolve o objetivo. Descubra apenas os arquivos e ferramentas pertinentes. As skills técnicas são **independentes**; não carregue todas por rotina.

## Padrões obrigatórios do usuário

- Português brasileiro, direto e natural; **simplicidade e clareza acima de tudo**.
- Linguagens: JavaScript, Python, C#; HTML, CSS e SQL quando necessário.
- Priorize APIs nativas e SDKs oficiais de organizações reconhecidas. Não adicione bibliotecas comunitárias/independentes sem autorização explícita; avalie necessidade, origem, permissões e privacidade.
- Preserve a arquitetura existente; em projetos vanilla, mantenha JS/HTML/CSS sem React/Vite.
- Em criptografia e autenticação, use padrões e APIs seguros; não invente algoritmos.
- Não exponha segredos; separe ambientes e não modifique produção, OAuth ou dados reais sem autorização adequada.

## Fluxo proporcional

1. **Entender:** objetivo, branch, arquivos reais, comportamento esperado e testes existentes. Sem alterar se foi pedido só análise.
2. **Decidir:** para escopo complexo ou indefinido, considere `descoberta-de-requisitos` e `planejamento-tecnico`; para bug, ative diretamente `depuracao`.
3. **Implementar:** faça mudanças pequenas em branch segura, sem reescrita fora do escopo. Para mudanças de comportamento testáveis, aplique `desenvolvimento-orientado-a-testes` com RED → GREEN → REFACTOR quando apropriado.
4. **Revisar:** confira diff, riscos, permissões, casos de borda e regressões. Peça revisão adicional se houver ferramenta/subagente disponível; **não invente subagentes**.
5. **Verificar:** antes de dizer que terminou, use `verificacao-de-entrega` e reporte comandos com resultados. Se houver merge/release, use `integracao-de-branches`.

Os arquivos `.md` desta pasta são referências internas que podem ser consultadas **sob demanda** para aprofundar engenharia e UX/UI, não skills separadas. Os fluxos completos são reservados a tarefas que os justifiquem.
