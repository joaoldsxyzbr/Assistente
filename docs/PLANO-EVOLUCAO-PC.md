# Plano de evolução do Assistente PC — referência Desktop Commander

> **Estado:** proposta técnica para revisão; **nenhuma funcionalidade deste plano está aprovada para implementação apenas por este documento**.  
> **Data:** 10/10/2026. **Repositório único:** [joaoldsxyzbr/Assistente](https://github.com/joaoldsxyzbr/Assistente).  
> **Pesquisa-base:** [issue #53](https://github.com/joaoldsxyzbr/Assistente/issues/53). **Decisão de segurança vigente:** [issue #48](https://github.com/joaoldsxyzbr/Assistente/issues/48).  
> **Referência de código conferida:** `main` no commit `e92a0179c30716c3e7de12a4a412eb4fc14622b9`. O estado instalado no computador não foi inspecionado nesta rodada.

## 1. Objetivo e fronteiras

Ampliar gradualmente as capacidades de **arquivos, pesquisa, interface Windows, diagnósticos e processos** do Assistente PC, usando o Remote Desktop Commander como **referência funcional**, sem copiar o serviço proprietário e sem substituir a arquitetura atual.

**Decisões já tomadas e que este plano preserva:**
- **Um único repositório, um único Worker e um único endpoint MCP.**
- `ChatGPT → Assistente Geral / Assistente MCPs → Worker Cloudflare (OAuth 2.1 + PKCE, catálogo permitido) → Durable Object/WebSocket → agente Windows C#/.NET na bandeja`.
- Sem capturas de tela, vídeo, cliques por coordenadas, simulação genérica de teclado ou terminal CMD/PowerShell arbitrário.
- UI Automation nativa, com padrões de acessibilidade, sem contornar UAC ou sessões bloqueadas.
- Token do PC separado, armazenado no Windows com DPAPI; segredos somente fora do GitHub.
- Acesso remoto ao PC desabilitado quando o secret/agent não estiver configurado; não interferir nas integrações de ponto, gastos, GitHub ou Cloudflare.

**Fora do escopo:** clonar o backend proprietário do Remote Desktop Commander; pagar ou depender do SaaS; instalar um segundo agente Node.js; desenvolver RDP/VNC; ler senhas ou cofres; executar código remoto arbitrário; remover proteções atuais; alterar produção por causa deste plano.

## 2. Diagnóstico confirmado do repositório

| Área | Estado verificado em `main` | Lacuna |
| --- | --- | --- |
| Transporte | `src/mcps/pc/gateway.ts`, `relay.ts`, WebSocket e Durable Object | Melhorar semântica de resultado incerto e negociação de capacidades |
| Catálogo | `src/mcps/pc/tools.ts` com allowlist e `isWrite` | Sem ferramentas de conteúdo de arquivos |
| Agente | `src/pc-agent/` em C#/.NET, bandeja, DPAPI | Precisa validação real de cada função no Windows |
| UIA | Inspeção; acionar, preencher, selecionar, marcar/desmarcar, expandir/recolher constam do catálogo atual | Nem todo aplicativo oferece padrões UIA; falta aferir comportamento em Windows real |
| Pastas | `pc_pasta_listar`: até 50 nomes/tipos em quatro pastas conhecidas | Não lê conteúdo, não busca por texto, não edita |
| Terminal | `pc_terminal`: identidade, computador, rede, processos | Não gerencia sessões de trabalho, nem lê logs paginados |
| Resposta | Resultado JSON limitado a 65.536 caracteres; relay usa timeout de 20 s; comando de entrada até 8.000 caracteres | Operações longas e grandes arquivos precisam limites/chunks e tratamento próprio |
| Concorrência | Relay reserva um comando após validar corpo | Escritas e reconexões devem preservar identidade e estado incerto |
| Releases | `docs/RELEASE-PC.md` descreve 0.5.0 | A documentação diz que 0.4 permanece instalada até atualização e teste real |

**Importante:** o código em `main` já contém alterações associadas à 0.5, mas **isso não prova que o executável 0.5 esteja instalado, validado ou ativo**. Verificar isso é a primeira entrega. Não anunciar recursos com base apenas em documentação/CI.

## 3. Arquitetura-alvo mínima

```text
ChatGPT / Assistente Geral
       │ OAuth 2.1 PKCE, mcp:read / mcp:write
       ▼
Cloudflare Worker assistente (o mesmo)
       │ catálogo fixo + validação de schema + política + flags
       ▼
PcRelay Durable Object (o mesmo)
       │ WebSocket autenticado, requestId, timeout e conexão identificada
       ▼
AssistentePc.exe C#/.NET (o mesmo, na bandeja)
       ├── UI Automation Windows (padrões suportados)
       ├── Diagnósticos permitidos
       └── Arquivos autorizados (novos módulos, opt-in)
```

Arquivos de implementação **sugeridos**, não criados:
- `src/mcps/pc/tools.ts`: catálogo e contratos de ferramentas;
- `src/mcps/pc/gateway.ts`: validação de escopo e encaminhamento;
- `src/mcps/pc/relay.ts`: protocolo, correlação e semântica de desconexão;
- `src/pc-agent/FilePolicy.cs`: política local de raízes e caminhos;
- `src/pc-agent/FileOperations.cs`: operações de arquivos;
- `src/pc-agent/Program.cs` e `TrayAgent.cs`: dispatcher, capacidades e aprovações locais;
- `tests/pc-tools.test.ts` e novos testes específicos; `docs/CONTROLE-PC.md` e `docs/RELEASE-PC.md` atualizados a cada entrega.

Não criar outro host MCP, Worker, banco D1, processo auxiliar permanente ou camada de abstração genérica sem necessidade comprovada.

## 4. Modelo de segurança e privacidade — obrigatório antes de ler arquivos

1. **Negar por padrão:** as quatro pastas que `pc_pasta_listar` já enumera **não** se tornam automaticamente legíveis. A leitura de conteúdo requer habilitar explicitamente uma raiz de trabalho pelo usuário no agente Windows. Começar com uma única pasta de teste sem dados sensíveis.
2. **IDs opacos de raízes:** o modelo informa `raizId` e `caminhoRelativo`; não pode enviar caminho absoluto, UNC, letra de unidade, caminho de dispositivo, variável de ambiente ou URI para ampliar acesso. A política local resolve a raiz.
3. **Verificação no Worker e no agente:** schema estrito, campos adicionais rejeitados, autorização real no agente. Escopo OAuth `mcp:read` / `mcp:write` é necessário, mas **não substitui** consentimento para operações sensíveis.
4. **Caminhos Windows:** bloquear `..`, separadores inesperados, caminhos absolutos, ADS (`:`), nomes reservados e prefixos `\\?\`; rejeitar reparse points/junctions/symlinks ao percorrer diretórios. A implementação deve operar com handles, revalidar caminho final e identidade do arquivo e tratar corridas TOCTOU; não confiar somente em `Path.GetFullPath`/comparação de strings.
5. **Conteúdo sensível:** não permitir acesso automático a credenciais, chaves, perfis de navegador, pastas de sistema ou arquivos de configuração secreta. Extensões proibidas ajudam, mas **não são a barreira principal**; a raiz autorizada e a aprovação do usuário são determinantes. Não registrar nomes completos ou conteúdo nos logs.
6. **Leituras também exfiltram:** texto lido será enviado ao serviço de IA que atende a conversa. Explicar isso na concessão da raiz e oferecer revogação imediata na bandeja. Conteúdo de arquivo é **dado não confiável**, nunca instrução para elevar privilégios ou executar outra ferramenta.
7. **Ações destrutivas:** exigir pedido explícito e confirmação local vinculada a operação, alvo, hash e prazo. Sem aprovação local, não implementar edição remota. Excluir/mover diretórios inteiros não entra na primeira versão.
8. **Proteção contra resultados incertos:** não repetir escrita automaticamente após timeout/desconexão. Consultar hash/estado real antes de qualquer nova tentativa. Operações devem ter `requestId` único; confirmação repetida não pode aplicar a mesma escrita duas vezes.
9. **Recursos:** limites por operação, quantidade de arquivos, bytes, profundidade, duração, saída e concorrência. Arquivos binários e documentos Office/PDF não entram na primeira fase de leitura/edição; processamento especializado exige avaliação separada.
10. **Observabilidade:** logar apenas timestamp, requestId/correlationId, tipo de ferramenta, código de resultado, duração e tamanho aproximado; sem argumentos brutos, caminhos, texto, credenciais ou saída do terminal. Não introduzir persistência de conteúdo no Worker/DO.

### Limites iniciais propostos (ajustáveis após teste)

| Operação | Limite inicial | Justificativa |
| --- | --- | --- |
| Listagem | 50 entradas por página, profundidade 1 | Coerente com `pc_pasta_listar` existente |
| Leitura textual | até 16 KiB por chamada; até 256 KiB por arquivo elegível | Mantém resposta abaixo de 65.536 caracteres e evita carga excessiva |
| Busca por nome | até 200 entradas examinadas, 20 resultados, 5 s | Previsibilidade |
| Busca por conteúdo (posterior) | até 100 arquivos textuais, 20 ocorrências, 5 s | Evita varredura irrestrita |
| Edição | até 64 KiB de texto por operação; sem binários | Facilita diff, hash e rollback |
| Aprovação local | validade de 2 minutos; uso único | Reduz replay |
| Comandos simultâneos | no máximo 1 operação remota ativa por dispositivo inicialmente | Preserva o relay atual |

**Atenção:** são **metas de projeto**, não capacidades existentes. A implementação deverá ajustar os limites à restrição real do relay (entrada 8.000 caracteres e timeout 20 s), inclusive usando chunks ou reduzindo o tamanho máximo de edição; não aumentar buffers indiscriminadamente.

## 5. Contratos MCP propostos

Preservar as ferramentas atuais e seus nomes. Acrescentar novas ferramentas somente quando o agente correspondente estiver disponível; retorno `unsupported_capability` se um cliente antigo tentar chamar algo novo. **Nunca anunciar automaticamente todas as capacidades detectadas sem passar pela allowlist fixa.**

| Ferramenta nova | Ação | Escopo | Fase |
| --- | --- | --- | --- |
| `pc_arquivo_info` | Metadados sem conteúdo | read | P2 |
| `pc_arquivo_ler` | Ler trecho de texto em raiz aprovada | read | P2 |
| `pc_arquivos_buscar` | Buscar nomes (conteúdo somente após revisão) | read | P2 |
| `pc_arquivo_preparar_edicao` | Validar alvo/hash e produzir prévia, sem gravar | read* | P3 |
| `pc_arquivo_confirmar_edicao` | Gravar após autorização local específica | write | P3 |
| `pc_diagnostico_log` | Ler log técnico limitado, sem dados privados | read | P4 |

*`preparar_edicao` não modifica arquivos, mas pode revelar conteúdo e deve usar as mesmas permissões de leitura; a emissão de token de confirmação precisa ser protegida contra reutilização. O mecanismo definitivo será decidido na implementação.*

Exemplos **ilustrativos**, não schemas implementados:

```json
{
  "name": "pc_arquivo_ler",
  "arguments": {
    "raizId": "trabalho",
    "caminhoRelativo": "notas/rascunho.txt",
    "offsetBytes": 0,
    "limiteBytes": 4096
  }
}
```

Resposta:
```json
{
  "ok": true,
  "data": {
    "texto": "conteúdo textual limitado",
    "offsetBytes": 0,
    "proximoOffsetBytes": 4096,
    "fim": false,
    "versaoHash": "sha256-do-arquivo"
  }
}
```

Para edição, o contrato final deve usar **preparar → apresentar diff → aprovar localmente → confirmar com hash esperado e token de uso único**. Revalidar a identidade do arquivo imediatamente antes da escrita; gravar temporário no mesmo volume, fazer substituição atômica quando suportada e manter backup de recuperação com acesso restrito e retenção curta. Em falha ou estado desconhecido, reconciliar hash e conteúdo antes de repetir. **Não** aceitar comandos de shell ou scripts como conteúdo executável.

### Protocolo de compatibilidade

- Preservar o envelope atual `{id,name,args}` enquanto houver agentes 0.4; introduzir `protocolVersion` e lista de `capabilities` por handshake compatível, **sem quebrar** mensagens antigas.
- Identificar versão do agente e da sessão WebSocket; respostas de conexões antigas não podem concluir requisições novas.
- Distinguir `not_supported`, `permission_denied`, `not_found`, `ambiguous`, `changed`, `timeout`, `disconnected` e `outcome_unknown`.
- Uma resposta `ok: true` em UIA não significa que o efeito final foi observado; indicar `confirmed`/`unverified` quando necessário.
- Feature flags desligadas por padrão até o agente estar atualizado e validado; deploy do Worker não deve expor ferramentas que a instalação não suporta.

## 6. Roadmap de execução — PRs pequenos e reversíveis

### P0 — estabelecer baseline e validar 0.5 (obrigatória, primeiro)

**Objetivo:** confirmar a versão instalada e estabilizar a UIA antes de ampliar privilégios.

Entregas sugeridas:
- Checklist de versão Worker/agent/catálogo e protocolo, status conectado, release e hash do ZIP.
- Teste manual em Windows real: Brave, Explorador, Bloco de Notas; inspeção, Invoke, Value, SelectionItem, Toggle e ExpandCollapse quando suportados.
- Reproduzir/classificar erro conhecido da pesquisa do Brave; confirmar janela-alvo, ambiguidade, foco, controle desabilitado, campo de senha, sessão bloqueada e UAC.
- Testar reconexão, duas chamadas simultâneas, timeout e resultado incerto sem duplicar ação.
- Registrar medições p50/p95 (amostra identificada; metas só depois do baseline), códigos de erro e resultados sem dados privados.
- Se necessário, correções pontuais em PRs separados, sem incluir funcionalidades novas.

**Aceite:** build Windows e `npm run check` verdes; testes reais registrados; 0.5 efetivamente instalada/validada **ou** motivo e plano de correção documentados. Sem regressão das ferramentas 0.4.

### P1 — fundação de autorização, protocolo e testes de segurança

**Objetivo:** tornar impossível ativar novas operações sem permissão local.

Entregas:
- Política de raízes no agente, configuração local e revogação pela bandeja.
- Validação de `raizId`/caminho, tratamento de reparse points, ADS, UNC, traversal e corridas.
- Limites de payload/tempo e erros estruturados; capacidade/versionamento sem quebrar agente antigo.
- Testes negativos automatizados em diretórios temporários sintéticos.
- Flags de recursos desligadas por padrão.

**Aceite:** casos maliciosos e acessos fora da raiz falham **no agente**, mesmo quando o Worker recebe argumentos sintaticamente válidos; nenhuma leitura de conteúdo habilitada por padrão; agente antigo continua operando.

### P2 — arquivos: leitura e pesquisa, somente texto

**Objetivo:** permitir operações úteis sem escrita.

**PR 2A:** `pc_arquivo_info` e `pc_arquivo_ler` com paginação por bytes, detecção de texto, truncamento e hash.  
**PR 2B:** `pc_arquivos_buscar` por nome; busca por conteúdo só se custo e privacidade forem aceitos.

**Aceite:** lê arquivo de teste autorizado e nega fora da raiz; conteúdo não entra em logs; arquivos binários/ilegíveis retornam erro controlado; limites respeitados; desconexão não causa leitura fora do escopo; testes Windows e MCP aprovados.

### P3 — edição segura de arquivos de texto (depende de P1 e P2)

**Objetivo:** editar texto sem sobrescrever mudanças concorrentes.

**PR 3A:** prévia/diff e hash do estado original, sem modificar arquivo.  
**PR 3B:** confirmação na bandeja, token local de uso único, gravação atômica/backup, checagem de hash e recuperação.

**Aceite:** sem aprovação local, nenhum byte é alterado; hash divergente bloqueia edição; falha entre preparar e confirmar não aplica edição; timeout/desconexão gera `outcome_unknown` e exige verificação; backup recupera versão anterior; sem exclusão de arquivos nesta fase.

**Portão de decisão:** se a aprovação local e o rollback não puderem ser garantidos, **não ativar P3**.

### P4 — diagnósticos e processos limitados (depende de P0/P1)

**Objetivo:** melhorar utilidade sem shell livre.

Entregas possíveis, priorizadas por casos reais: leitura paginada de logs do próprio agente; status/duração de ações; enumeração de processos com filtros seguros; encerramento apenas de processos explicitamente permitidos e após confirmação específica, se necessário. Sessões persistentes genéricas e execução de comandos arbitrários permanecem fora do escopo.

**Aceite:** comandos extras, caminhos arbitrários, scripts e PowerShell/CMD não são aceitos; saída tem limites; nenhuma operação interfere em processos críticos do Windows.

### P5 — múltiplos computadores (opcional; não iniciar sem demanda)

**Objetivo:** selecionar/revogar dispositivos independentemente.

Proposta mínima: `deviceId` estável e não adivinhável, segredo separado por dispositivo, status, revogação e alvo explícito em chamadas; isolamento por dispositivo no Durable Object. Migrar sem quebrar o dispositivo único `principal`. Revisar custo, complexidade e modelo de consentimento antes de qualquer PR.

**Aceite:** um dispositivo não recebe comandos de outro; revogação impede novas conexões; alvo ausente/ambíguo não é escolhido silenciosamente; rollback preserva o PC atual.

## 7. Dependências, complexidade e decisões

| Etapa | Depende de | Complexidade relativa | Prioridade |
| --- | --- | --- | --- |
| P0 baseline/UIA | Código 0.5 e acesso ao Windows real | Média | Obrigatória |
| P1 política/protocolo | P0 | Alta (segurança de arquivos no Windows) | Obrigatória antes de arquivos |
| P2 leitura | P1 | Média | Alta |
| P3 edição | P1 + P2 + aprovação local | Alta | Condicional |
| P4 diagnósticos | P0 + P1 | Baixa–média | Média |
| P5 multidispositivo | Validação de demanda | Alta | Opcional |

Complexidade é estimativa qualitativa; não é prazo nem compromisso de entrega.

**Decisões pendentes antes de implementar:**
- Qual pasta **não sensível** o usuário quer autorizar para teste? Padrão: nenhuma.
- O usuário quer liberar conteúdo ao ChatGPT por pasta, por sessão ou por arquivo? Proposta: consentimento explícito ao habilitar raiz e confirmação adicional para arquivos sensíveis.
- É aceitável exigir aprovação na bandeja para cada edição? **Recomendado: sim.**
- Quais fluxos reais justificam busca por conteúdo, gestão de processos ou múltiplos PCs? Não construir antes de existir caso de uso.
- Qual retenção e local dos backups temporários? Definir antes de P3.
- Haverá reutilização literal de código MIT? Se sim, inventariar arquivos e preservar licença/avisos.

## 8. Plano de testes, release e rollback

**Matriz automatizada (dados sintéticos):**
- Contratos MCP: ferramentas permitidas, `mcp:read`/`mcp:write`, argumentos adicionais, tipos e limites, resposta sem imagem.
- Segurança de arquivos: caminhos relativos/absolutos, `..`, Unicode, UNC, ADS, nomes reservados, junction/symlink/reparse, troca de alvo durante a operação, links circulares, arquivos grandes e binários.
- Escrita: hash antigo, hash alterado, dupla confirmação, aprovação expirada, falha no disco, backup, desconexão antes/depois da escrita e retorno incerto.
- Transporte: agente 0.4 versus Worker novo, reconexão, respostas tardias, duas chamadas simultâneas, timeout e sessão trocada.
- Não regressão: ponto, gastos, GitHub, Cloudflare, OAuth, bandeja e diagnósticos atuais.

**Validação real Windows:** em pasta descartável, usuário conectado, agente na bandeja, Brave/Explorador/Bloco de Notas, UIA, permissões, revogação, reconexão e recuperação. Não usar dados pessoais reais em testes.

**CI:** `npm ci` e `npm run check`; build/publicação win-x64 conforme workflow existente; revisar checks de PR e Workers Builds. CI verde não substitui validação manual do PC.

**Ordem segura de entrega por fase:**
1. Branch e PR pequeno, documentação e testes; revisão dos contratos/segurança.
2. CI verde e build do agente; testar em ambiente descartável.
3. Worker com feature flag **off**, sem habilitar ferramentas novas para agentes antigos.
4. Instalar/validar agente compatível; confirmar capacidades e autorização local.
5. Habilitar a ferramenta explicitamente e reconectar catálogo MCP no ChatGPT, se necessário.
6. Observar erros e limites sem registrar dados sensíveis.
7. Se falhar: desabilitar flag/catálogo, retornar versão anterior do agente/Worker e reconciliar eventuais escritas incertas. **Não** promover versão automaticamente apenas por CI.

**Definição de pronto para cada fase:** documentação e issue atualizadas; testes de contrato/negativos; revisão de segurança; build; teste real quando aplicável; release identificável; rollback testado; nenhuma regressão nos MCPs existentes; evidências registradas no GitHub.

## 9. Backlog de issues/PRs proposto

Manter [#53](https://github.com/joaoldsxyzbr/Assistente/issues/53) como **issue guarda-chuva** da pesquisa e deste plano; [#48](https://github.com/joaoldsxyzbr/Assistente/issues/48) preserva a decisão anterior sobre UIA/terminal. Cada entrega abaixo deve virar issue pequena com checklist e PR correspondente:

- **P0:** validar agente 0.5 no Windows real e registrar baseline/UIA/erros.
- **P1:** política de raízes, protocolo de capacidades e testes negativos.
- **P2A:** metadados/leitura paginada de arquivos de texto autorizados.
- **P2B:** pesquisa limitada de nomes de arquivos autorizados.
- **P3A:** prévia/diff e controle de versão sem escrita.
- **P3B:** aprovação local, edição atômica, backup e reconciliação.
- **P4:** diagnósticos e processos permitidos, sem shell arbitrário.
- **P5:** multidispositivo, **backlog opcional**, não executar sem confirmação.

Não juntar P1, P2 e P3 em um único PR. Nunca iniciar implementação só porque a issue foi criada.

## 10. Referências e licenças

**Fonte de verdade do nosso sistema:** [README](../README.md), [Arquitetura](ARQUITETURA.md), [Controle PC](CONTROLE-PC.md), [Release PC](RELEASE-PC.md), [pesquisa #53](https://github.com/joaoldsxyzbr/Assistente/issues/53), [decisão #48](https://github.com/joaoldsxyzbr/Assistente/issues/48).

**Referências externas, somente para comparação:** [Remote Desktop Commander](https://github.com/desktop-commander/remote-desktop-commander) (serviço/artefatos proprietários), [DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) (código aberto MIT; conferir licença e dependências antes de copiar), [Microsoft UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlpatternsoverview), [Microsoft UIA caching](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-cachingforclients), [Cloudflare Durable Objects/WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [MCP security](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices).

**Limitações deste planejamento:** não houve execução no Windows, teste de penetração, auditoria do backend proprietário, instalação do Remote Desktop Commander nem verificação de produção. Este documento descreve o estado do GitHub e uma proposta de evolução, não funcionalidades entregues.
