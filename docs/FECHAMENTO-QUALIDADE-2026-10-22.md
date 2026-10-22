# Fechamento técnico — qualidade Assistente MCPs (22/10/2026)

## Escopo

Manter a arquitetura: Cloudflare Worker único, 25 ferramentas públicas próprias, MCPs e OAuth oficiais no backend, APIs nativas e SDKs oficiais. Nenhum D1 adicional, painel, dependência nova ou renovação indevida de permissões.

## Ajustes finais

1. Remover o wrapper de `registerTool` que classificava todas as ferramentas especiais como `upstream` antes de validar argumentos.
2. Instrumentar operações GitHub/Cloudflare diretamente, distinguindo validação, OAuth, conexão, operação remota, normalização e prévia.
3. Nas ferramentas de edição GitHub e realocação, marcar tentativa de mutação apenas antes da primeira escrita efetiva na API. Não presumir escrita em erro de pré-validação.
4. Interpretar `success:false` da Cloudflare também como `isError:true` para o cliente.
5. Ampliar testes de escrita simulada, erros e confidencialidade.

## Validação e limites

Executar CI da branch e da main, comparar commit e versão do Worker, publicar versão nova só após validação. Após deploy, testar leituras reais e verificar se o catálogo permanece com 25 ferramentas.

A coleta de eventos no Workers Logs requer inspeção da ferramenta de observabilidade com autorização apropriada; CI de código não comprova persistência de logs. Não declarar a intermitência definitivamente eliminada sem uso real.

**Ação de segurança que exige acesso humano:** verificar e, se ainda não tiver ocorrido, rotacionar no GitHub a credencial OAuth anteriormente compartilhada em conversa, atualizando o secret no Worker através do painel seguro. Nenhum valor de segredo deve entrar no chat, GitHub ou logs; conexão OAuth vigente sozinha não comprova que houve rotação.
