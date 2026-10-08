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

## Plano de compatibilidade e desempenho — pesquisa de 08/10/2026 (proposta, não implementada)

**Decisão:** preservar C#/.NET + Worker TypeScript + Durable Object/WebSocket e priorizar a UI Automation nativa. Continuar **sem screenshots, clique por coordenadas ou shell arbitrário**. FlaUI é alternativa só se testes reais justificarem dependência; o `winapp CLI` oficial está em prévia pública, sendo referência de comportamento, não requisito de instalação.

### Evidência observada e diagnóstico do código 0.4
- Teste real no Brave: inspeção dos controles e abertura de uma nova guia funcionaram; acionar «Pesquisa em todas as guias» retornou erro genérico. **A causa exata não foi identificada**, porque `Program.ReceiveCommands` converte várias exceções em uma mesma mensagem.
- `WindowAutomation.Act` suporta somente `InvokePattern` e `ValuePattern`, não padrões para seleção, alternância e expansão.
- A busca atual usa janela em primeiro plano, nome/AutomationId exatos e até dois resultados; a inspeção alcança até 70 elementos, 250 nós e 6 níveis. O sinal `truncado` não identifica todas as formas de corte. IDs derivados da posição/árvore podem mudar.
- A enumeração via `TreeWalker` chama propriedades individuais, que podem exigir viagens entre processos. A Microsoft recomenda escopo e cache de propriedades.
- No `PcRelay`, o teste `pending.size` ocorre antes de operações assíncronas para ler o corpo; verificar exclusividade atômica sob duas requisições simultâneas. Não foi constatado conflito em produção.
- `TerminalCommands` utiliza UTF-8 ao ler utilitários legados; `ipconfig` apresentou caracteres incorretos. Verificar code page/encoding real, sem impor UTF-8 a um executável que não emite UTF-8.

### Ordem recomendada (pequenos PRs; uma integração e CI final por lote)
1. **Diagnóstico e segurança (P0):** códigos estruturados `not_found`, `ambiguous`, `unsupported_pattern`, `disabled`, `offscreen`, `stale`, `target_changed`, `timeout`, `unknown`; mensagens sem valores sensíveis; correlation ID, duração local/Worker e versão; timeout controlado e nenhuma repetição cega de escrita.
2. **Ações UIA (P1):** declarar capacidades por elemento; `Invoke`, `Value`, `SelectionItem`, `Toggle`, `ExpandCollapse` (e `ScrollItem` apenas se os casos reais exigirem); ações explícitas, estado-alvo idempotente quando possível, checagem antes e depois. Não simular clique quando faltarem padrões.
3. **Alvo estável (P1):** inspeção e ação com identificação de janela/processo; filtros de tipo, identificador, pai/escopo, habilitado/visível. Resolver ambiguidade explicitamente, verificar se janela/foco mudou e se a referência do elemento expirou antes de editar. Sempre evitar confiar em nomes isolados de aplicações diferentes.
4. **Eficiência e robustez (P2):** buscas locais e cache por consulta (com invalidação quando UI mudar); limitar resultados sem perder indicação de truncamento. Executar UIA longe da thread gráfica, serializar alterações de interface, isolar providers travados sem bloquear a conexão e revisar a janela crítica de concorrência no relay.
5. **Terminal objetivo (P3):** manter comandos permitidos e adicionar somente operações estruturadas que resolvam fluxos reais, com diretórios/escopos autorizados. Corrigir encoding dos diagnósticos. Sem PowerShell/CMD arbitrário por padrão.

### Segurança e limites
- Ações em aplicativos podem modificar ou excluir dados: só executar no escopo do pedido do usuário e confirmar ações sensíveis. Metadados `isWrite`/anotações não são controle efetivo de permissão.
- Nunca retornar senhas/credenciais nem valores de campos sensíveis; evitar logs com textos de controles e conteúdos da página. Segregar autenticação MCP e token do PC; aplicar autenticação e autorização reais no Worker.
- UIA depende da acessibilidade fornecida pelos aplicativos. Não prometer acesso a canvas, jogos, UAC, janelas elevadas ou sessões indisponíveis; não enfraquecer o UAC nem usar `uiAccess` como atalho. Caracterizar o comportamento em sessão bloqueada por ação e aplicativo, sem suposições universais.
- Em timeout ou desconexão depois de ação, resultado de escrita pode ser **incerto**: reconciliar estado antes de qualquer nova tentativa.

### Critérios para considerar a próxima versão validada
- Reproduzir e classificar o erro do botão de pesquisa do Brave; conseguir nova guia e controle de estado compatível sem imagem; relatar de forma específica quando um controle não oferecer padrão.
- Exercitar Brave, Explorador e Bloco de Notas em Windows real; casos positivos e negativos: nome duplicado, elemento removido, janela trocada, controle desabilitado, campo de senha, duas solicitações simultâneas, perda da conexão e timeout.
- Registrar tempos p50/p95 por tipo de ação antes e depois; somente depois definir metas numéricas de velocidade.
- Rodar testes de contrato, compilação Windows e CI para o estado final; **CI verde não substitui teste real no PC**.

### Fontes primárias consultadas
- Microsoft, padrões UIA: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlpatternsoverview
- Microsoft, desempenho/cache: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-cachingforclients
- Microsoft, elementos e busca: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-obtainingelements
- Microsoft, threading COM: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-threading
- Microsoft, winapp CLI (prévia): https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/
- MCP, boas práticas de segurança: https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices
- Cloudflare, WebSockets em Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- FlaUI (alternativa, não adotada): https://github.com/FlaUI/FlaUI

## Implementação 0.5 (branch em validação)

- Atualização para .NET 10 LTS, compilação WinExe em segundo plano, sem console e sem capturas.
- `pc_ui_elementos` preserva os campos existentes e adiciona `janelaId`, `visitados`, `duracaoMs`; `truncado` inclui limites de nós e profundidade.
- `pc_ui_acao` preserva `acionar`/`preencher`, adiciona `selecionar`, `marcar`, `desmarcar`, `expandir`, `recolher`, com `janelaId` e `tipo` opcionais. Marcar/desmarcar só muda o estado quando necessário; controle sem padrão retorna `unsupported_pattern` (sem clique por coordenadas).
- Falhas previstas retornam códigos claros para controle ausente, ambíguo, oculto, desabilitado, janela alterada e estado não confirmado. Conteúdo de controles de senha nunca é exposto.
- `pc_pasta_listar` só lista nomes e tipos de até 50 entradas nas quatro pastas predefinidas; não lê conteúdo nem permite caminhos arbitrários. O terminal continua limitado aos quatro diagnósticos existentes.
- Exclusividade de comandos foi deslocada para depois da leitura/validação do corpo no Durable Object, evitando a janela de corrida.
- Saída dos diagnósticos do Windows decodificada pela página de código OEM do sistema para preservar acentos.

**Compatibilidade:** a versão 0.4 continua sendo a versão efetivamente instalada no PC até uma versão 0.5 ser gerada, instalada e verificada. Ações da UIA são dependentes do provedor de acessibilidade; operações sensíveis só quando explicitamente solicitadas. Não afirmar sucesso apenas pelo retorno de Invoke quando não for possível observar o estado final.

**Validação necessária:** testes de catálogo/validação no Node, compilação e empacotamento win-x64 no GitHub Actions, testes de padrões UIA em Windows real, concorrência e reconexão; confirmar compatibilidade do Brave e do Explorador. Publicação de release só após CI verde.
