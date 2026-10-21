# Layouts responsivos e densidade de informação

Use em sidebars, grids, dashboards, listas, tabelas, mobile e redimensionamento de janelas.

## Método
1. Comece pela tarefa e pela densidade adequada: sistemas operacionais de uso diário podem precisar de informações mais compactas do que landing pages.
2. Organize em regiões claras: navegação, contexto/título, ações principais, filtros, conteúdo e feedback. Evite colunas vazias ou cards grandes para informações pequenas.
3. Prefira recursos nativos de CSS: Grid, Flexbox, variáveis CSS, `minmax()`, `clamp()`, media queries e container queries quando o suporte alvo permitir.
4. Adapte a estrutura, não apenas diminua fontes. Em telas estreitas, reordene controles, compacte ações e preserve contexto de navegação. Tabelas largas exigem tratamento específico (rolagem contextualizada, colunas priorizadas ou exibição alternativa conforme tarefa).
5. Teste larguras representativas (por exemplo 360, 768, 1280 e 1920 px), zoom do navegador e conteúdo real com títulos longos, estados vazios e muitos registros; são exemplos, não limites obrigatórios.
6. Em monitores grandes, controle largura de leitura sem limitar artificialmente tabelas e áreas que ganham utilidade com mais espaço.
7. Preserve preferências já definidas (ex.: sidebar minimalista sem ocultar) e comportamento anterior fora do escopo.

## Critérios de aceite
- Sem cortes, sobreposições ou rolagem horizontal da página indevida.
- Botões e filtros continuam alcançáveis; tabelas preservam leitura e comparação.
- O layout funciona com dados longos, vazios, carregando e com zoom.

Referências: https://developer.apple.com/design/human-interface-guidelines/layout ; https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries