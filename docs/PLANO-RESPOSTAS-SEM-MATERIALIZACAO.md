# Plano — respostas sem materialização pelo Assistente MCPs

Status: **planejado, não implementado**. Escopo: `joaoldsxyzbr/Assistente-mcps`, branch `main`. Não modificar OAuth, D1 nem produção antes da validação.

## Objetivo e limite

O Assistente MCPs **não deve emitir anexos, recursos MCP, imagens ou arquivos** nas respostas das ferramentas GitHub/Cloudflare encaminhadas ao ChatGPT. O único tipo de bloco `content` permitido na saída desse proxy será `{ "type": "text", "text": "..." }`. Isso elimina materialização causada por **tipos de conteúdo transmitidos pelo nosso Worker**. O próprio ChatGPT pode, independentemente, transformar textos em arquivos: esse comportamento é externo ao nosso controle e precisa de teste ponta a ponta; não prometer bloqueio absoluto sem evidência.

## Implementação mínima

1. Criar `normalizeRemoteResult(response)` e aplicá-lo a cada retorno dos provedores em `server/remote-tools.js`.
2. Aceitar texto com validação de tipos. Para `embedded resource` com texto, extrair somente o texto, identificado pela URI e pelo tipo MIME; para `resource_link`, retornar apenas URI/título seguro, sem anexar o recurso. Imagens, áudio e binários devem produzir mensagem textual explícita dizendo que o conteúdo não foi encaminhado; **não inventar transcrição**.
3. **Não encaminhar** `_meta` nem `structuredContent` sem análise: podem carregar payloads ou metadados especiais. Quando informação estruturada for necessária, serializá-la em texto JSON com limite de tamanho, redigindo campos sensíveis quando aplicável. Evitar duplicar conteúdo já representado em `content`.
4. **Não truncar silenciosamente**: para respostas grandes, indicar que o resultado excedeu o limite e usar consultas paginadas/por trecho quando a ferramenta oferecer; caso não ofereça, comunicar a limitação sem apresentar conteúdo incompleto como completo.
5. Preservar `isError` e distinção entre erro confirmado e escrita de estado desconhecido. Não repetir automaticamente escritas que tenham falhado por timeout.
6. Não substituir o cliente oficial, não duplicar ferramentas, não alterar OAuth, segredos ou endpoints.

## Testes obrigatórios antes do deploy

- Texto simples, JSON, `structuredContent`, `embedded resource` textual, `resource_link`, imagem e dados binários, combinações e valores inválidos.
- Respostas muito grandes, erros do provedor, timeout e operação de escrita sem confirmação.
- Asserts: nenhum bloco com `type` diferente de `text`; nenhum dado codificado de imagem/arquivo é reencaminhado; `isError` é preservado; nenhuma perda silenciosa de dados.
- Testes focados e `npm run check`; CI aprovado antes de integrar; testar leitura real via Assistente MCPs e verificar se o ChatGPT ainda materializa anexos.
- Se ainda houver materialização de **texto puro** pela plataforma, registrar limitação e não declarar o requisito atendido.

## Critério de conclusão

Sem anexos/recursos emitidos pelo Worker, leitura e operações mantidas, OAuth intacto, testes verdes e **validação real na interface**. Publicação em produção somente após revisão e aprovação.