# Assistente PC 0.5.0 — UI Automation e terminal controlado

Atualização incremental em **.NET 10 LTS**, mantendo o aplicativo na bandeja do Windows, a reconexão automática, o token protegido e a comunicação por WebSocket. Não utiliza screenshots, mouse por coordenadas ou shell arbitrário.

## Melhorias
- UI Automation com **acionar**, **preencher**, **selecionar**, **marcar**, **desmarcar**, **expandir** e **recolher**, usando somente padrões suportados pelos controles; falhas específicas quando indisponíveis.
- Inspeção sem imagem informa `janelaId`, quantidade de nós, truncamento e duração. É possível informar o ID/tipo esperado na ação para evitar controlar a janela errada.
- `pc_pasta_listar` consulta apenas nomes e tipos das primeiras 50 entradas em Downloads, Documentos, Imagens ou Área de Trabalho. Nenhuma leitura de conteúdo de arquivo.
- Proteção contra duas operações remotas concorrentes no relay e correção da codificação dos comandos do terminal Windows.
- Catálogo anterior mantido para evitar incompatibilidade com as ferramentas existentes.

## Instalar e testar
1. Confirme no GitHub e Cloudflare que o **Worker foi atualizado** e que o catálogo MCP novo está disponível. Se o build Cloudflare falhar por token inválido (9109), corrija o token em Cloudflare > Worker > Settings > Builds > API token antes de considerar o deploy concluído.
2. Saia do Assistente PC 0.4 pela bandeja do Windows.
3. Baixe e extraia `AssistentePc-win-x64.zip` substituindo os arquivos antigos na mesma pasta.
4. Execute `AssistentePc.exe`. O token local criptografado é preservado para o usuário Windows atual.
5. Confirme **Status: Conectado**. Reconecte o Assistente MCPs no ChatGPT caso as ferramentas novas ainda não apareçam.
6. Teste em aplicativos seguros (Brave, Explorador, Bloco de Notas) `pc_ui_elementos`, depois uma ação sem efeitos sensíveis. Confirme comportamento real no Windows.

Esta versão exige testes reais no PC para comprovar compatibilidade com cada aplicativo; build/CI verde não substitui isso.

[Manual](https://github.com/joaoldsxyzbr/Assistente/blob/main/docs/CONTROLE-PC.md) · O ZIP vem com `SHA256SUMS.txt` para verificação de integridade.
