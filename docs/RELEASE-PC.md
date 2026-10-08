# Assistente PC — terminal + UI Automation (0.4.0)

A versão 0.4 remove completamente captura de tela e comandos por mouse/teclado simulados. O app mantém bandeja, reconexão, token protegido e inicialização opcional com Windows.

**Novo:** `pc_terminal` (diagnósticos restritos, sem shell), `pc_ui_elementos` (controles da janela ativa) e `pc_ui_acao` (InvokePattern/ValuePattern, sem campos de senha).

**Atenção:** esta é uma mudança incompatível nas ferramentas MCP. Atualize o Worker e o aplicativo antes do teste. Reconecte Assistente MCPs caso as ferramentas novas não apareçam no chat. Não existe execução arbitrária de comandos.

## Instalar
1. Feche o Assistente PC atual usando **Sair** na bandeja.
2. Extraia `AssistentePc-win-x64.zip` em uma pasta permanente, substituindo os arquivos anteriores.
3. Execute `AssistentePc.exe`. O token salvo no perfil Windows é preservado.
4. Confirme o status Conectado e teste `pc_terminal` e `pc_ui_elementos`.

O ZIP inclui checksum `SHA256SUMS.txt`. Veja [guia](https://github.com/joaoldsxyzbr/Assistente/blob/main/docs/CONTROLE-PC.md). A validação visual real foi substituída por verificação estrutural de controles e ainda requer teste no Windows do usuário.
