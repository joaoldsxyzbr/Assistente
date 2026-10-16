# Integração dos MCPs oficiais no Worker

## Arquitetura-alvo

```text
ChatGPT → Assistente MCPs (Worker Cloudflare)
                       ├── MCP GitHub oficial
                       ├── MCP Cloudflare oficial
                       └── Skills: ponto, gastos, desenvolvimento
```

As ferramentas de listagem e chamada remota usam o protocolo MCP por HTTPS e endereços fixos. O código do Worker é JavaScript puro (ES Modules). As dependências de transporte e OAuth são SDKs oficiais.

## Bloqueio de autenticação para produção

O OAuth do ChatGPT para o Assistente **não** concede acesso aos MCPs GitHub/Cloudflare. A ponte de protocolo implementada nesta branch aceita apenas access tokens OAuth dos provedores fornecidos de forma segura pelo ambiente do Worker: `GITHUB_OAUTH_ACCESS_TOKEN` e `CLOUDFLARE_OAUTH_ACCESS_TOKEN`. **Não existe ainda captura, consentimento, armazenamento criptografado e renovação automática desses tokens.** Por isso, não promover esta branch para produção como integração OAuth finalizada.

Os próprios MCPs oficiais podem exigir registro de clientes e consentimento específicos. Credenciais NÃO devem ser copiadas do ChatGPT, nem registradas no GitHub, nem obtidas por sessões de terceiros. Configurar OAuth de cada origem com autorização explícita do proprietário e confirmar os escopos necessários antes do deploy.

## Segurança

- Nunca aceite endereço de servidor MCP de parâmetros externos. Endpoints permitidos são fixos.
- O servidor só registra chamadas se o access token upstream estiver presente no ambiente; resultados e erros não expõem tokens.
- Todas as chamadas genéricas `mcp_*_call` são classificadas como escrita pelo OAuth do Assistente. Escritas remotas devem ser autorizadas pelo usuário e nunca repetidas automaticamente após resultado incerto.
- A listagem remota prévia restringe os nomes à lista anunciada pelo servidor de origem; isso **não** substitui uma allowlist de operações sensíveis. Antes de produção, aplicar permissões granulares e controles de ferramenta de acordo com o caso de uso.
- IDs D1 de ponto e gastos são instruções, não autorizações.
- Evitar tokens estáticos de longa duração. OAuth completo precisa contemplar expiração, refresh, rotação e revogação.

## Próximos requisitos de aceite

1. Implementar consentimento upstream específico para GitHub e Cloudflare, com client registration/PKCE quando suportado.
2. Armazenar tokens de modo protegido, vinculados ao usuário, com renovação e revogação.
3. Implementar allowlist/escopos de ferramentas remotas e política de autorização de escrita.
4. Testes de login, refresh, permissões e chamada real de leitura; nenhum teste de escrita no D1 real.
5. CI verde, versão de preview testada, promoção e verificação de produção.
