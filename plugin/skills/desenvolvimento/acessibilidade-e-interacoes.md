# Acessibilidade, clareza e interações

Use em formulários, navegação, modais, ações, tabelas, atalhos e revisão UX/UI.

## Método
1. Use HTML semântico, rótulos visíveis, instruções claras e botões apropriados. Não substitua semântica por `div` clicável sem necessidade.
2. As interações essenciais devem funcionar com teclado. Garanta foco visível, ordem lógica de tabulação e foco gerenciado em modais.
3. Considere WCAG 2.2 nível AA: texto comum com contraste >= 4,5:1; texto grande >= 3:1; controles com área-alvo >= 24x24 CSS px ou exceções aplicáveis. Em toque, prefira alvos confortavelmente maiores quando possível.
4. Não dependa exclusivamente de cor, tooltip no hover ou animação para comunicar informação. Explique estados e erros textualmente.
5. Preserve zoom até 200% sem perda de conteúdo/funcionalidade e respeite `prefers-reduced-motion` para efeitos não essenciais.
6. Mensagens de erro devem dizer o que ocorreu e como resolver; associe-as aos campos e, em formulários longos, considere resumo de erros.
7. Não alegue conformidade WCAG integral sem uma auditoria apropriada.

## Critérios de aceite
- O fluxo principal é navegável por teclado e compreensível sem depender apenas de cor.
- Campos e botões têm nomes/estados claros; erros são recuperáveis.
- Critérios objetivos de contraste, foco, zoom e alvo são checados.

Referências: https://www.w3.org/TR/WCAG22/ ; https://design-system.service.gov.uk/components/error-summary/
