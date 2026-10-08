# Controle do PC via Assistente MCPs — primeira versão

O servidor MCP e o aplicativo Windows C# estão no mesmo repositório: src/mcps/pc/ e src/pc-agent/. O DeskPilot existente foi consultado como referência de capacidades; não compartilhamos automaticamente seu backend nem suas credenciais. Ainda é necessário testar a integração real.

## Ferramentas iniciais

- pc_status, pc_janelas, pc_tela: conexão, títulos de janelas e JPEG da tela principal.
- pc_abrir: somente bloco_de_notas, calculadora, explorador.
- pc_clicar, pc_digitar, pc_tecla: coordenadas, Unicode e atalhos permitidos.

Não há shell irrestrito, escrita em arquivos, elevação, instalação de software ou suporte multi-monitor na primeira versão. Windows precisa estar ligado com sessão interativa desbloqueada para ações visuais. Capturas podem incluir dados privados; evite telas sensíveis.

## Ativação

1. Gere localmente uma senha aleatória com PowerShell:
   [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
2. No painel da Cloudflare, Worker assistente, Settings → Variables and Secrets, cadastre o valor como **secret PC_AGENT_TOKEN**. Nunca envie ao chat nem faça commit do segredo.
3. Publique/promova a nova versão do Worker após os testes. Enquanto o secret não estiver configurado, as ferramentas pc_* permanecem ocultas.
4. Após o CI Windows verde, baixe o artefato AssistentePc-win-x64; também é possível executar dotnet publish no projeto src/pc-agent/AssistentePc.csproj.
5. No Windows, execute AssistentePc.exe configure, cole o token no prompt oculto. A credencial ficará protegida pela DPAPI em %LOCALAPPDATA%\Assistente\pc-secret.dat.
6. Execute AssistentePc.exe com sua sessão do Windows aberta. O programa reconecta automaticamente ao domínio assistente.joaolds.xyz.br sem abrir portas no roteador.
7. Atualize/recarregue o app Assistente MCPs no ChatGPT, se o catálogo estiver em cache, e teste pc_status.
8. Depois de confirmado, crie um atalho para AssistentePc.exe na pasta Inicializar do usuário para conectá-lo automaticamente após logon.

## Segurança e comportamento

A conexão Windows sai do computador para wss://assistente.joaolds.xyz.br/pc/connect e requer um bearer separado da autorização OAuth do ChatGPT. Os comandos são validados pelo Worker e novamente no aplicativo. A comunicação WebSocket é mantida pelo Durable Object PcRelay do mesmo Worker; não cria outro MCP externo. O Worker limita a uma sessão conectada. A ponte usa `ctx.exports.PcRelay` (loopback local), sem binding de Durable Object no Wrangler; isso permite gerar versões antes de provisionar o namespace na promoção inicial. Ações de escrita precisam do escopo mcp:write do OAuth.

O segredo não é versionado nem armazenado em logs. JPEGs e conteúdo digitado transitam nas respostas MCP e não são gravados no banco. Uma tentativa que caiu após enviar comando pode ter sido aplicada; consulte a tela/estado antes de repetir.

Para suspender o controle, encerre o aplicativo com Ctrl+C. Para apagar credencial local execute AssistentePc.exe reset; revogue também o secret PC_AGENT_TOKEN na Cloudflare.

## Verificações e limites

- CI Node: npm run check cobre TypeScript, testes e build dry-run.
- CI Windows: dotnet publish gera o programa self-contained como artefato GitHub Actions.
- Ainda faltam: secret do usuário configurado, versão ativa publicada, instalação no PC e smoke de ponta a ponta.
- Não interfere nos dados de ponto, gastos ou no banco D1 existente.
- A imagem retorna com tipo MCP image/jpeg; validar renderização no ChatGPT ao testar.
- Não há integração de UI Automation nomeada, bandeja do sistema ou pareamento por código nesta versão. Essas melhorias ficam para etapas posteriores somente se forem necessárias.

Referências oficiais:
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- https://ts.sdk.modelcontextprotocol.io/server
- https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata

## Builds e versões

O gatilho Cloudflare de branches executa `npx wrangler deploy --dry-run --config wrangler.assistente.jsonc`: valida o bundle **sem publicar Preview, sem subir versão e sem tocar em produção**. Essa escolha evita criar um KV de Preview e evita o conflito de nome de Worker no gatilho de branches. Já o gatilho da `main` usa `npx wrangler versions upload --config wrangler.assistente.jsonc`, criando uma versão inativa; a promoção para produção continua separada.

Os gatilhos de branches e da `main` devem apontar para um **Build API token válido**, configurado fora do Git. São configurações distintas no Cloudflare Workers Builds. O CI GitHub também valida TypeScript, testes e compilação Windows; o dry-run não substitui um teste real do PC nem comprova deploy em produção.
