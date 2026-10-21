# Auditoria visual e acabamento

Use após mudanças visuais, em revisões completas ou quando houver reclamações como “está estranho”, “cara de IA” ou “layout pouco profissional”.

## Método
1. Observe a **interface real renderizada** no navegador ou em capturas fornecidas, se disponíveis. Não confunda revisão de CSS/código com inspeção visual efetiva.
2. Avalie cada tela relevante, não só a home: login, navegação, formulários, listagens, detalhes, dashboards, modais, perfis e estados vazios.
3. Confira hierarquia, alinhamento, espaçamento, tipografia, consistência, densidade, contraste, truncamento, responsividade, uso correto de gráficos e acessibilidade.
4. Avalie com dados realistas: registros muitos/nenhum, textos longos, erros, carregamento e diferentes permissões, sem usar dados reais sensíveis sem autorização.
5. Classifique achados por impacto na tarefa (bloqueante, importante, cosmético) e corrija a causa sistêmica antes de microajustes dispersos.
6. Compare antes/depois quando possível; repita até remover defeitos perceptíveis. Se houver apenas código disponível, informe que a validação visual depende de renderização.
7. Comprove testes realizados e indique telas/breakpoints não conferidos. Nunca declare que “todas as telas foram verificadas” sem evidência.

## Critérios de aceite
- Não há desalinhamentos, elementos cortados, padrões inconsistentes ou ações sem feedback conhecidos.
- Diferenças intencionais entre telas estão justificadas pelo trabalho do usuário.
- O relatório separa defeitos realmente observados de hipóteses.

Referências: https://www.nngroup.com/articles/aesthetic-usability-effect/ ; https://www.nngroup.com/articles/data-tables/