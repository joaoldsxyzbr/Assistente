# P0 — linha de base do Assistente PC (10/10/2026)

**Estado:** parcialmente validado; **bloqueado pela instalação local do agente 0.5 no Windows**.  
**Issue:** [#55](https://github.com/joaoldsxyzbr/Assistente/issues/55). **Roadmap:** [PR #54](https://github.com/joaoldsxyzbr/Assistente/pull/54).  
**Fonte de verdade:** repositório [joaoldsxyzbr/Assistente](https://github.com/joaoldsxyzbr/Assistente), branch `main` no commit `e92a0179c30716c3e7de12a4a412eb4fc14622b9`.

Este registro contém **somente evidências técnicas minimizadas**. Não inclui hostname, nome de usuário, títulos completos de janelas, caminhos pessoais, credenciais ou conteúdo de arquivos.

## 1. Evidências verificadas

| Verificação | Evidência | Resultado |
| --- | --- | --- |
| Conectividade remota | `pc_status` | **Online** |
| Versão instalada | `pc_informacoes` | **0.4.0**, Windows x64 |
| Release 0.5 | [GitHub Actions run #37861018137](https://github.com/joaoldsxyzbr/Assistente/actions/runs/37861018137), em 08/10/2026 | **Sucesso**: compilação, empacotamento SHA-256 e publicação no GitHub Releases |
| Pacote publicado | [`pc-v0.5.0-beta.1`](https://github.com/joaoldsxyzbr/Assistente/releases/tag/pc-v0.5.0-beta.1) | Tag e URL confirmadas no log do job de release; pacote `AssistentePc-win-x64.zip` e `SHA256SUMS.txt` são produzidos pelo workflow |
| CI do planejamento | [Run #38054854635](https://github.com/joaoldsxyzbr/Assistente/actions/runs/38054854635) | **Sucesso** nos jobs `checks` e `windows-agent` |
| Prévia Cloudflare do PR #54 | [PR #54](https://github.com/joaoldsxyzbr/Assistente/pull/54) | Check externo **falhou**; problema de autenticação de prévias já documentado na [issue #52](https://github.com/joaoldsxyzbr/Assistente/issues/52). Não foi feita análise do log específico desta execução; não confundir com falha de produção |
| Abertura de aplicativo | `pc_abrir` com `bloco_de_notas`, seguida de `pc_janelas` | Pedido aceito; Bloco de Notas aparece na lista de janelas |
| Inspeção UIA 0.4 | `pc_ui_elementos` após abertura do Bloco de Notas | A janela **ativa** continuou sendo o Brave; 14 controles retornados, incluindo botão de pesquisa de guias. A inspeção não acessou o Bloco de Notas |
| Ações UIA de escrita | Não executadas nesta rodada | **Não testadas** para evitar interferência na sessão em uso |
| UIA 0.5, novos padrões, `janelaId`, erros estruturados, pasta listar | Agente instalado ainda é 0.4 | **Não validados no Windows real** |

**Conclusão da etapa atual:** o serviço remoto funciona e a versão 0.5 foi compilada/publicada, mas **não está instalada**. Portanto, ainda não é possível afirmar que as novas ações de UI Automation funcionam na máquina. A resposta do `pc_abrir` confirma apenas o despacho da abertura; não garante que a janela receba foco. Esse detalhe importa porque a UIA atual inspeciona a janela em primeiro plano.

## 2. Próxima ação local necessária (manual e reversível)

**Não executar substituição remota pelo agente 0.4:** ele não dispõe de ferramenta segura de instalação, leitura arbitrária ou execução de programas externos. O usuário deve fazer a troca localmente.

1. Na bandeja do Windows, anotar a versão atual e **sair** do Assistente PC 0.4. Não escolher `reset` nem apagar dados de configuração.
2. Fazer uma cópia de segurança da **pasta do executável antigo**, para rollback. Não copiar tokens/segredos para o repositório.
3. Abrir o [release oficial `pc-v0.5.0-beta.1`](https://github.com/joaoldsxyzbr/Assistente/releases/tag/pc-v0.5.0-beta.1). Baixar `AssistentePc-win-x64.zip` e `SHA256SUMS.txt`.
4. Verificar o hash SHA-256 do ZIP antes de extrair. No PowerShell local, dentro da pasta dos downloads:  
   `Get-FileHash .\AssistentePc-win-x64.zip -Algorithm SHA256`  
   Comparar com o valor em `SHA256SUMS.txt`. Não continuar se forem diferentes.
5. Extrair os arquivos do ZIP na **mesma pasta do aplicativo**, substituindo os antigos, e iniciar `AssistentePc.exe`. O token protegido por DPAPI deve ser reaproveitado para o mesmo usuário Windows.
6. Confirmar na bandeja **Status: Conectado**. Recarregar/reconectar o Assistente MCPs no ChatGPT caso o catálogo antigo permaneça visível.
7. Executar `pc_informacoes` novamente e confirmar versão **0.5.0**. Se permanecer 0.4.0, conferir processo antigo/atalho apontando para outra pasta; não assumir atualização.
8. Fazer testes UIA **somente em aplicativos sem dados sensíveis** e quando a sessão não estiver em uso. Testar inspeção no Brave, Explorador e Bloco de Notas, seguida de ações inofensivas com controle e janela esperados. Anotar erros e duração sem registrar dados privados.
9. Se houver regressão, sair do 0.5 e restaurar a pasta do executável anterior. Não fazer reset do token. Reconfirmar `pc_status` e `pc_informacoes` após rollback.

### Testes P0 pendentes após instalar 0.5

| Cenário | Como validar | Aceite |
| --- | --- | --- |
| Identificação | `pc_informacoes` | Versão 0.5.0 e online |
| Catálogo | Reabrir conexão MCP | Ações UIA tipadas e `pc_pasta_listar` visíveis conforme permissões |
| Brave | `pc_ui_elementos` com janela Brave ativa; botão de pesquisa de guias | `janelaId` e duração presentes; erro específico se padrão não suportado |
| Bloco de Notas | `pc_ui_elementos` com janela ativa; preencher texto **descartável** apenas se permitido | Ação controlada e sem gravar arquivo real |
| Explorador | Inspecionar controles acessíveis | Sem tentativa de acesso a arquivos fora de escopo |
| Negativos | Janela trocada, alvo inexistente/ambíguo, controle desabilitado, senha | Erros específicos, sem ação indevida |
| Transporte | Desconexão/reconexão e concorrência, sem ação sensível | Não aplicar duas vezes operação de resultado incerto |
| Regressão | Terminal de diagnósticos fixos, status, janelas | Nenhum shell livre nem screenshots |
| CI | `npm run check` e build Windows | Verde; **não substitui teste local** |

**Medições p50/p95:** ainda não coletadas. Definir amostra e registrar somente depois de testar a versão 0.5, sem fabricar métricas.

## 3. Pendências e limites

- [x] Conferir conexão e versão instalada.
- [x] Verificar CI e release 0.5 no GitHub.
- [x] Inspecionar UIA da janela ativa sem alterar conteúdo.
- [x] Registrar a falha separada da prévia Cloudflare em [#52](https://github.com/joaoldsxyzbr/Assistente/issues/52).
- [ ] Instalar/validar o agente 0.5 no Windows real.
- [ ] Revalidar ferramentas anunciadas após reconectar MCP.
- [ ] Exercitar UIA em três aplicativos e casos negativos sem dados pessoais.
- [ ] Medir tempos e documentar erros e comportamento de reconexão.
- [ ] Só depois aprovar a entrada na fase P1.

**Segurança e escopo:** nenhuma captura de tela, leitura de arquivo, comando de shell livre, mudança de Worker/produção ou alteração de configurações locais foi feita nesta validação. A única ação local executada foi solicitar a abertura do Bloco de Notas; o aplicativo apareceu entre as janelas, mas o foco permaneceu no navegador. Não se afirma que a atualização foi realizada.

## 4. Validação automatizada exclusivamente no GitHub

A solicitação de execução pelo GitHub é atendida **até o limite técnico da arquitetura atual**: o GitHub Actions consegue verificar o pacote publicado, seu SHA-256, a extração, os metadados de versão e o comando de autoteste de terminal em um runner Windows descartável. **Não consegue instalar ou trocar o executável do computador pessoal**: o agente 0.4 não possui canal de atualização remota, e um runner GitHub não é a sessão Windows do usuário. Não introduzir mecanismo de execução arbitrária ou expor credenciais para contornar essa restrição.

Workflow: [`verify-pc-release.yml`](../.github/workflows/verify-pc-release.yml), acionado quando sua própria definição é proposta em PR e manualmente no GitHub Actions após a integração. Padrão de release: `pc-v0.5.0-beta.1`.

O teste automatizado **não** verifica UI Automation de aplicativos reais, foco da janela, sessão bloqueada, UAC, DPAPI do usuário, reconexão ao Worker ou instalação na máquina pessoal. Esses itens permanecem pendentes na [issue #55](https://github.com/joaoldsxyzbr/Assistente/issues/55). Um resultado verde **não autoriza** declarar P0 concluída.

**Próxima etapa de produto, caso seja desejada instalação futura sem intervenção manual:** desenhar um atualizador **opt-in**, autenticado, com assinatura/integridade, aprovação local, rollback e teste de recuperação. Isso requer uma primeira instalação local de uma versão que já inclua o atualizador; não é possível ativá-lo retroativamente no 0.4 apenas por um commit. Implementação sujeita a revisão específica de segurança.
