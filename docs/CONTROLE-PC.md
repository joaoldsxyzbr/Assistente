# Assistente PC — aplicativo Windows na bandeja

O **Assistente MCPs** controla um aplicativo Windows em C# por uma conexão de saída WebSocket ao Worker existente. Não é necessário abrir CMD nem criar outro MCP. Os controles remotos mantêm a mesma autenticação e as ferramentas atuais.

## Recursos

- Inicia discretamente na **bandeja do Windows**, perto do relógio, sem janela de console.
- Mantém a conexão em segundo plano e tenta reconectar a cada 5 segundos se houver queda.
- Botão direito no ícone: **Status**, **Reconectar**, **Configurar token**, **Iniciar com Windows** e **Sair**.
- A inicialização com Windows é **opcional** e pode ser ligada/desligada no menu. É configurada apenas para o usuário atual, sem privilégios de administrador.
- Não abre uma segunda instância ao clicar novamente no executável.
- Na primeira execução pede o token por janela com campo oculto; caso cancele, permanece na bandeja sem conexão.
- Salva o token protegido pela DPAPI em `%LOCALAPPDATA%\Assistente\pc-secret.dat`; não registra o valor em logs nem no repositório.

## Instalar ou atualizar

1. Se estiver usando a versão antiga com janela preta, encerre-a com **Ctrl+C**.
2. Baixe o ZIP da versão mais recente em [GitHub Releases](https://github.com/joaoldsxyzbr/Assistente/releases), extraia **todo** o conteúdo para uma pasta permanente, por exemplo `C:\AssistentePc`, e execute `AssistentePc.exe` por duplo clique. Não é necessário instalar .NET.
3. No primeiro acesso, informe o **mesmo** `PC_AGENT_TOKEN` cadastrado como secret no Worker `assistente` da Cloudflare. Na atualização, o token protegido do usuário atual é reutilizado automaticamente.
4. Confira o ícone na bandeja; clique com o botão direito e veja **Status: Conectado**. Se não estiver visível, abra os ícones ocultos ao lado do relógio.
5. Opcionalmente ative **Iniciar com Windows** no mesmo menu. Deixe o executável na pasta definitiva antes de ativar; mover/excluir o arquivo depois pode quebrar a inicialização.
6. No ChatGPT, teste `pc_status`, `pc_janelas` ou `pc_abrir` pelo Assistente MCPs.

O aplicativo deve permanecer ativo na bandeja para permitir controles. **Sair** encerra o processo e a conexão; fechar uma janela de configuração não encerra o aplicativo. É necessário estar logado no Windows para executar ações visuais; com a sessão bloqueada, capturas e cliques podem não funcionar.

## Configuração e segurança

- Para trocar a chave use **Configurar token** no menu; o aplicativo reconecta usando o novo valor.
- Para apagar a credencial, encerre o aplicativo e execute `AssistentePc.exe reset` (exibe uma confirmação visual), depois revogue o secret no Worker.
- `AssistentePc.exe configure` abre somente o diálogo para salvar o token; abra/reconecte o aplicativo depois.
- O caminho da conexão é `wss://assistente.joaolds.xyz.br/pc/connect`. O token `PC_AGENT_TOKEN` é distinto do OAuth do ChatGPT.
- Os comandos são validados no Worker e novamente no programa. Não existe shell irrestrito, elevação, escrita de arquivos nem suporte multi-monitor nesta versão.
- `pc_status` consulta a conexão; `pc_informacoes` mostra versão do agente, nome da máquina, Windows, arquitetura, tempo ligado e tamanho da tela; `pc_processos` lista até 40 nomes de programas em execução (somente leitura).
- `pc_janelas` lista janelas visíveis; `pc_tela` captura a tela ativa. `pc_abrir` continua restrito a Bloco de Notas, Calculadora e Explorador.
- `pc_pasta` abre apenas Downloads, Documentos, Imagens ou Área de Trabalho no Explorador.
- `pc_clicar` aceita clique simples esquerdo (padrão), clique direito e duplo clique esquerdo. `pc_rolar` rola a janela sob o mouse de 1 a 12 passos.
- `pc_tecla` aceita teclas de navegação, atualizar (F5), edição e atalhos usuais do navegador. `pc_digitar` continua restrito a até 500 caracteres, sem credenciais.
- Essas novas ferramentas exigem **ambos:** Worker atualizado/promovido e versão mais recente do aplicativo Windows. O MCP só anuncia as ferramentas do Worker ativo; um executável antigo não sabe executar os novos comandos.
- Capturas de tela e conteúdo digitado podem ser sensíveis; não utilize em sessões compartilhadas ou com dados secretos expostos.

## Desenvolvimento e validação

O código do aplicativo fica em `src/pc-agent/` (`.NET 8`, Windows Forms, `WinExe`). O Worker e as ferramentas MCP ficam em `src/mcps/pc/`.

- CI GitHub: `npm run check` e `dotnet publish src/pc-agent/AssistentePc.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true`.
- O workflow `.github/workflows/release-pc.yml` gera o ZIP e checksum de cada release.
- A conexão real do agente anterior foi confirmada no Windows em 08/10/2026 com `pc_status`, `pc_janelas` e abertura da Calculadora. **O usuário confirmou o funcionamento da bandeja no Windows. As novas ferramentas desta atualização ainda exigem testes reais após instalar a versão atualizada.**
- O Worker e as credenciais existentes não precisam ser modificados para esta mudança visual.
- Referência oficial: [Microsoft — NotifyIcon no Windows Forms](https://learn.microsoft.com/en-us/dotnet/desktop/winforms/controls/notifyicon-component-windows-forms).
