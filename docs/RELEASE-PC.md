# Assistente PC — versão com bandeja

Aplicativo portátil para Windows x64. Abre na **bandeja do Windows**, sem CMD, e mantém o controle remoto via Assistente MCPs em segundo plano.

**Correção 0.3.1:** ajusta o layout nativo de `SendInput` para recuperar `pc_tecla` e `pc_digitar`. O GitHub CI testa o tamanho da estrutura no Windows; confirme o funcionamento com um texto de teste após atualizar.\n\n**Novas capacidades:** informações do Windows, lista dos processos, abertura de pastas conhecidas, rolagem, clique direito/duplo clique e teclas de navegação, busca e abas. Sem PowerShell, execução de comandos, acesso arbitrário ao disco ou tarefas administrativas.

**Atenção:** as novas ferramentas aparecem no ChatGPT somente quando a nova versão do Worker for promovida para produção e o catálogo do Assistente MCPs for atualizado. O novo aplicativo Windows sozinho não publica ferramentas no ChatGPT.

## Como atualizar

1. Se você estiver usando uma versão antiga com a janela preta, pressione **Ctrl+C** para encerrá-la.
2. Baixe o anexo **AssistentePc-win-x64.zip** deste release e extraia os arquivos para uma pasta definitiva, como `C:\AssistentePc`.
3. Dê duplo clique em **AssistentePc.exe**. O ícone aparecerá perto do relógio do Windows (talvez nos ícones ocultos). Nenhuma janela preta precisa ficar aberta.
4. Clique com o botão direito no ícone para conferir **Status**, **Reconectar**, **Configurar token**, **Iniciar com Windows** (opcional) ou **Sair**.
5. Se você já havia configurado o PC, o token salvo no Windows é reutilizado. Se for a primeira vez, a janela solicita o mesmo token do secret `PC_AGENT_TOKEN` no Worker Cloudflare.

**Importante:** configure **Iniciar com Windows** somente depois de deixar o executável na pasta definitiva. Para desconectar, use **Sair** na bandeja. Para apagar a credencial, encerre o aplicativo e execute `AssistentePc.exe reset`.

O teste de compilação automático não substitui a confirmação visual no seu Windows. Veja [o guia completo](https://github.com/joaoldsxyzbr/Assistente/blob/main/docs/CONTROLE-PC.md). O anexo `SHA256SUMS.txt` permite verificar o ZIP.
