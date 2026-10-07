# Assistente

Host TypeScript para organizar e coordenar MCPs independentes por domínio. O primeiro núcleo implementa catálogo, conexão remota, descoberta de ferramentas e roteamento isolado.

## Estado

- Repositório iniciado em `main`; desenvolvimento segue em branch e pull request.
- Os bancos de ponto e gastos existentes são preservados.
- Endpoints e credenciais reais ainda não foram configurados; nenhum dado é lido ou alterado por esta base.
- Plano completo: [docs/PLANO.md](docs/PLANO.md) e [Issue #1](https://github.com/joaoldsxyzbr/Assistente/issues/1).

## Requisitos

- Node.js 24 ou superior para testes locais.
- npm.

## Executar verificações

```sh
npm install
npm run check
```

`npm run check` executa o verificador TypeScript e os testes do núcleo.

## Configuração de MCPs

Cada MCP precisa de endpoint HTTPS e token bearer próprios. Configure as variáveis do ambiente de execução indicadas em [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Não coloque tokens em arquivos versionados.

O host só chama os servidores explicitamente configurados. Uma indisponibilidade afeta o MCP correspondente; o host não repete automaticamente chamadas após falha, pois uma escrita pode já ter sido aceita pelo servidor.
