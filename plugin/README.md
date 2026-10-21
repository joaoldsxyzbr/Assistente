# Assistente — v1.0.1 (especialistas + app MCP GitHub e Cloudflare)

O **Assistente** é a central, organizada por especialistas diretamente na pasta `skills/`.

```text
Assistente/
├── plugin.json
├── .app.json
├── .codex-plugin/plugin.json
├── README.md
└── skills/
    ├── desenvolvimento/
    │   ├── SKILL.md
    │   ├── analisar.md
    │   ├── planejar.md
    │   ├── implementar.md
    │   ├── depurar.md
    │   ├── testar.md
    │   ├── revisar.md
    │   ├── entregar.md
    │   ├── ux-e-fluxos.md
    │   ├── direcao-visual.md
    │   ├── layout-responsivo.md
    │   ├── sistema-visual.md
    │   ├── acessibilidade-e-interacoes.md
    │   └── auditoria-visual.md
    └── instrucoes-e-comportamento/
        ├── SKILL.md
        ├── conversar.md
        ├── interpretar-intencao.md
        ├── autonomia-e-limites.md
        ├── preferencias-e-contexto.md
        ├── clareza-e-formato.md
        └── confiabilidade.md
```

## Como funciona

- `plugin.json`: identidade da central **Assistente**, com referência ao app MCP.
- `.app.json`: vínculo ao app **Assistente** já existente no ChatGPT (sem copiar tokens nem criar outra integração).
- `skills/desenvolvimento/SKILL.md`: especialista técnico, com 13 métodos auxiliares (7 engenharia + 6 UX/UI).
- `skills/instrucoes-e-comportamento/SKILL.md`: especialista transversal, com 6 métodos auxiliares.
- Arquivos `.md` ao lado de cada `SKILL.md` são referências internas, não skills independentes.
- O app **Assistente** conectado reúne as ferramentas oficiais dos MCPs **GitHub** e **Cloudflare**, expostas pela ponte hospedada separadamente. O repositório inclui apenas o vínculo com esse app, **não o código-fonte do servidor MCP nem credenciais**.
- As conexões GitHub e Cloudflare são gerenciadas pelo app; não há necessidade de inventar `mcp.json` com endpoints não confirmados.

## Importação e limites

Para importar o plugin, o pacote deve incluir na raiz `plugin.json`, `.app.json` e `skills/`.
A documentação oficial descreve descoberta de uma skill por `SKILL.md` em cada subpasta imediata de `skills/`.

**Importante:** as skills são consideradas pelo modelo conforme o pedido. Este pacote, por si só, **não garante ativação obrigatória em toda mensagem**. Para regras que devem orientar todas as conversas, mantenha também as instruções personalizadas do ChatGPT.

O arquivo `.app.json` referencia um App existente. A associação depende de autorização e das permissões da conta; a existência dessa referência no GitHub, sozinha, **não instala nem atualiza automaticamente** o plugin do ChatGPT.

Fontes:
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/build/skills
- https://agent-plugins.org/specification
## MCPs disponíveis pelo app

| Integração | Função | Onde é gerenciada |
| --- | --- | --- |
| GitHub | Repositórios, arquivos, branches e demais operações autorizadas | App Assistente conectado |
| Cloudflare | Workers, D1 e demais recursos autorizados | App Assistente conectado |

O repositório é a fonte das instruções e da configuração de vínculo. O servidor MCP permanece na infraestrutura existente.
## Atualização do plugin existente

O plugin **Assistente** instalado no ChatGPT possui o identificador técnico imutável `dev-6ad8b78e1d9881919055627f45ecc43a`. Por isso, o campo `name` de `plugin.json` e do manifesto de compatibilidade deve corresponder a esse nome. O nome mostrado ao usuário continua sendo **Assistente**.

A partir desta versão, o manifesto segue os metadados originais do app existente; as instruções detalhadas permanecem nestas skills e neste README. Para atualizar o plugin existente, use o ZIP da branch `main` no fluxo de **atualização**, não no de criação. A presença de `.app.json` vincula o mesmo app; não cria outros MCPs nem armazena credenciais.