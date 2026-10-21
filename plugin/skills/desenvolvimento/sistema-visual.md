# Sistema visual e componentes consistentes

Use quando várias telas compartilham estilos, componentes, padrões de navegação, temas e formulários.

## Método
1. Levante estilos e componentes existentes antes de criar novos. Preserve componentes funcionais, reduzindo divergência visual entre telas.
2. Defina tokens CSS mínimos e semânticos: fundo, superfície, texto, texto secundário, borda, destaque, sucesso, aviso, erro, raios, espaçamento e tipografia. Evite tokenização excessiva.
3. Padronize cabeçalhos, tabelas, botões, inputs, selects, badges de estado, modal, menus, sidebar, notificações e estados interativos com HTML semântico.
4. Estabeleça estados: padrão, hover, foco, ativo, desabilitado, carregando, vazio, erro e sucesso, com linguagem clara.
5. Use componentes reutilizáveis apenas quando o compartilhamento real justificar abstração; em projetos vanilla, privilegie HTML/CSS/JS nativos e APIs do navegador.
6. Cada tela pode ter composição própria sem perder a identidade comum. Evite aplicar a mesma grade de cards a recebimento, relatórios, usuários e lojas quando as tarefas forem diferentes.
7. Valide modo claro/escuro somente onde existir ou for pedido; contraste e hierarquia valem para ambos.

## Critérios de aceite
- Interfaces da mesma aplicação parecem parte do mesmo produto.
- Mudanças de tema ou estilo centralizado não quebram telas adjacentes.
- Componentes mantêm comportamento, acessibilidade e semântica previsíveis.

Referências: https://design-system.service.gov.uk/components/ ; https://design-system.service.gov.uk/styles/
