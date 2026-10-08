# Assistente PC — terminal controlado + UI Automation (0.4)

O aplicativo Windows continua na bandeja, sem CMD aberto. A comunicação permanece ChatGPT → Assistente MCPs → Worker → WebSocket → agente Windows.

## Mudança de abordagem
- **Removidos:** `pc_tela` e todo envio de imagens; cliques por coordenadas, rolagem, teclas e digitação simuladas (`pc_clicar`, `pc_rolar`, `pc_tecla`, `pc_digitar`). Não existe captura de tela ou vídeo no agente 0.4.
- **Terminal controlado:** `pc_terminal` aceita exclusivamente `identidade` (whoami), `computador` (hostname), `rede` (ipconfig) e `processos` (tasklist), sem shell, scripts, argumentos adicionais ou execução de arquivos externos. O processo é oculto, tem limite de 9 segundos e trunca a saída.
- **UI Automation:** `pc_ui_elementos` lê até 70 controles acessíveis na **janela ativa** por nome, identificador de automação e tipo. Não retorna valores atuais de campos e ignora controles de senha. `pc_ui_acao` encontra **um único** controle pela correspondência exata de nome/identificador e executa apenas `acionar` (InvokePattern) ou `preencher` (ValuePattern, até 500 caracteres), nunca em senha.
- **Mantidos:** `pc_status`, `pc_informacoes`, `pc_processos`, `pc_janelas`, `pc_abrir` e `pc_pasta`.

### Limitações do UI Automation
A interface precisa expor controles acessíveis; canvas, jogos, certos navegadores/sites e aplicações com provedor de acessibilidade incompleto podem não funcionar. A janela-alvo deve estar ativa e a sessão do Windows desbloqueada. Não contornamos controles de segurança/UAC. Recomendado inspecionar antes de acionar. Sem screenshot não há fallback visual.

## Atualização do Windows
1. Saia do aplicativo antigo pelo ícone na bandeja.
2. Baixe `AssistentePc-win-x64.zip` do [release](https://github.com/joaoldsxyzbr/Assistente/releases) e extraia na pasta definitiva, substituindo os arquivos anteriores.
3. Abra `AssistentePc.exe`; o token DPAPI existente é reutilizado automaticamente.
4. Confira **Status: Conectado** no menu da bandeja. A opção **Iniciar com Windows** é mantida.
5. Reconecte/atualize o plugin Assistente MCPs no ChatGPT para renovar o catálogo de ferramentas. Antes de trocar o agente, o Worker novo já não anuncia as ferramentas antigas.

## Segurança
Sem execução livre de PowerShell, CMD ou scripts remotos. A lista fixa de comandos é validada no Worker **e** no agente; argumento extra é rejeitado. Operações de UIA são marcadas como escrita no escopo OAuth do MCP, mas isso não equivale a aprovação interativa por comando. Ainda é necessário observar o efeito no aplicativo e confirmar ações sensíveis. Nenhuma imagem é transmitida ou armazenada. Resultados e nomes de janelas/controles podem conter dados pessoais; trate-os como conteúdo sensível.

## Validação
- CI: `npm run check`, `dotnet publish ... -r win-x64 --self-contained true -p:PublishSingleFile=true` e `--check-terminal`.
- Testes de schema verificam que ferramentas antigas não existem e scripts/argumentos de terminal são recusados.
- O build Windows não prova compatibilidade de cada app com UI Automation; executar testes reais após instalar a versão 0.4.
- Fonte oficial: [Microsoft — MSBuild Windows Desktop](https://learn.microsoft.com/pt-br/dotnet/core/project-sdk/msbuild-props-desktop), [InvokePattern](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.invokepattern.invoke), [ValuePattern](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.valuepattern.setvalue).
