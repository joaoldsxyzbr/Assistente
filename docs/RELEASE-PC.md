# Assistente PC — primeira versão para testes

Aplicativo portátil Windows x64 para conectar seu PC ao Assistente MCP. **Versão beta:** compilação automatizada validada, mas controle real ainda precisa ser testado no seu computador.

## Como instalar

1. Baixe **AssistentePc-win-x64.zip** nos anexos (*Assets*) desta página.
2. Extraia todo o conteúdo em uma pasta, como `C:\AssistentePc`.
3. No Worker `assistente` da Cloudflare, configure um Secret chamado `PC_AGENT_TOKEN`, com o mesmo valor que será informado no aplicativo. Não envie o token por chat nem grave-o no GitHub.
4. Dê **duplo clique** no `AssistentePc.exe`: na primeira abertura, ele orienta a configuração e pede a mesma chave, com digitação oculta. Pressione ESC para cancelar.
5. Após salvar, o aplicativo inicia a conexão automaticamente. Mantenha a janela aberta durante o teste; use Ctrl+C para desconectar. Se preferir PowerShell, execute `.\AssistentePc.exe configure` e depois `.\AssistentePc.exe`.

Se a versão atual do Worker ainda não tiver sido promovida, o app não conectará até a ativação do Worker. O aplicativo usa a conexão de saída, sem abrir portas do roteador. Não há instalador ou necessidade de instalar .NET.

Verificação opcional: o anexo `SHA256SUMS.txt` traz o SHA-256 do ZIP. Veja também [o guia completo](https://github.com/joaoldsxyzbr/Assistente/blob/main/docs/CONTROLE-PC.md).

**Segurança:** controle somente com consentimento. Não mantenha o Windows desbloqueado sem necessidade. Para apagar a credencial local: `.\AssistentePc.exe reset` e revogue o Secret na Cloudflare.
