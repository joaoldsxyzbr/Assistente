# Plano — Respostas sem materialização automática

**Data:** 2026-10-17
**Escopo:** `joaoldsxyzbr/Assistente-mcps`, mantendo OAuth atual e MCPs oficiais GitHub/Cloudflare.
**Estado:** planejamento; nenhuma alteração funcional autorizada por este documento.

## Objetivo não negociável

Impedir que o **nosso MCP** envie ao ChatGPT conteúdos de ferramenta que possam ser interpretados como arquivos/anexos. O objetivo não é simplesmente diminuir ocorrências: o contrato de saída do hub deve ser **somente texto**, inclusive quando provedores retornam código, JSON, `resource_link`, `resource`, imagem, áudio ou dados binários.

A criação de anexos pela própria plataforma, fora do controle do nosso servidor, não pode ser garantidamente bloqueada. A validação ponta a ponta deve observar o comportamento real no ChatGPT; não considerar o problema resolvido apenas por testes unitários verdes.

## Estado atual e causa provável

- `server/remote-tools.js`, `safeResult()`, repassa `content`, `structuredContent` e `_meta` recebidos dos MCPs oficiais sem normalizar todos os formatos.
- As ferramentas oficiais podem retornar blocos `text`, `resource`, `resource_link`, `image`, `audio` e `structuredContent`; a apresentação desses blocos cabe ao cliente.
- A hipótese precisa ser confirmada com testes reais: o encaminhamento de blocos de recursos pode disparar materialização. Também pode existir transformação automática do próprio ChatGPT que nosso MCP não controla.

## Contrato de saída proposto

1. **Único tipo permitido em `content`:** `{ type: "text", text: "..." }`.
2. **Texto e código:** devolver texto fiel, com informação de origem e tipo quando relevante. Nenhuma criação de arquivo auxiliar.
3. **JSON e dados estruturados:** serializar em texto JSON válido; preservar `isError` e os campos necessários para interpretar a operação. Não encaminhar `structuredContent` nem `_meta` remotamente recebidos sem revisão explícita.
4. **`resource` textual:** extrair `resource.text` em bloco texto, mantendo metadados úteis (nome, tipo, origem) sem recurso embutido.
5. **`resource_link`:** transformar em texto descritivo; somente URLs HTTPS seguras podem aparecer como referências navegáveis; nunca enviar como bloco `resource_link`.
6. **Imagem, áudio, bytes/base64 e outros binários:** NÃO encaminhar nem converter base64 em texto gigante. Retornar somente metadados seguros e informação explícita de que o conteúdo binário não foi enviado; eventual link externo precisa ser fornecido legitimamente pelo provedor.
7. **Formatos inesperados:** falhar de maneira informativa (*fail closed*), não encaminhar o payload bruto.
8. **Respostas grandes:** estabelecer limite mensurável e estratégia de paginação/leitura por partes, sem truncamento silencioso e sem armazenar anexos locais. Qualquer recurso de paginação deve ser testado antes de adotado.
9. **Erros:** preservar `isError`, evitar incluir tokens, payloads sensíveis e detalhes internos. Em escritas remotas de resultado incerto, nunca repetir automaticamente a operação.

## Mudança mínima planejada

- `server/remote-tools.js`: substituir encaminhamento direto por normalização estrita do resultado.
- Adicionar módulo utilitário pequeno **somente se** reduzir complexidade real.
- `tests/remote-tools.test.js`: aumentar cobertura do contrato de saída.
- Acrescentar testes de integração com respostas simuladas, sem mexer em D1, tokens, secrets ou configuração OAuth.
- Atualizar os docs de arquitetura e o README **somente após** confirmar os resultados.

Não clonar implementações dos MCPs oficiais e não alterar `server/upstream-oauth.js` nem o gerenciamento de sessões sem defeito concreto demonstrado.

## Casos obrigatórios de teste

- GitHub `get_file_contents`: texto pequeno e texto longo.
- GitHub: listagem, arquivo inexistente, link de recurso, recurso embutido e resposta com MIME textual.
- Cloudflare: consultas D1 em modo leitura, JSON, erro de permissão, rate limit e timeout.
- Respostas `image`, `audio` e blobs: apenas metadados, nunca binários ou recursos.
- `structuredContent` com objetos/arrays e objetos que contenham chaves de recursos.
- Todos os testes devem verificar que **nenhum item de `content` tem tipo diferente de `text`**.
- Simular respostas grandes e conferir que não há truncamento oculto nem perdas declaradas como sucesso.
- Teste manual end-to-end no ChatGPT, verificando ausência de cartões/anexos materializados ao consultar arquivos pelo nosso MCP.

## Critério de aceite e limite

1. Testes locais e CI existentes concluídos com sucesso.
2. OAuth, conexão dos dois provedores, skills e contratos anteriores preservados.
3. 100% dos resultados emitidos pelo nosso MCP atendem ao contrato **somente texto**.
4. Consulta real de arquivos no ChatGPT **sem materialização** em cenários de aceite (arquivo curto, longo, erro, link).
5. Se a plataforma materializar mesmo com saída somente texto, **não declarar solução completa**; registrar evidência e isolar o comportamento externo, sem acrescentar infraestrutura arbitrariamente.
6. Criar PR, revisar diff e checks, só integrar à main depois da validação. Nunca escrever em D1 real para testar.

**Princípio:** simplicidade, clareza, estabilidade e segurança; preservar o que já funciona.
