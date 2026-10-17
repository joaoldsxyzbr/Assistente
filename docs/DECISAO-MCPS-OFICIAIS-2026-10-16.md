# Decisão de arquitetura — MCPs oficiais com OAuth

**Data:** 2026-10-16  
**Repositório:** `joaoldsxyzbr/Assistente-mcps`  
**Estado:** diretriz aprovada; migração e desativação do Worker ainda não executadas.

## Objetivo

Manter a solução **simples, segura e robusta**, reduzindo burocracia e manutenção de integrações próprias. A robustez virá da utilização dos MCPs oficiais e dos mecanismos de autenticação e disponibilidade fornecidos pelos respectivos provedores, sem ampliar desnecessariamente o código do projeto.

## Arquitetura desejada

ChatGPT → **MCP GitHub oficial** e **MCP Cloudflare oficial** → serviços dos provedores.

- **GitHub:** endpoint remoto oficial `https://api.githubcopilot.com/mcp/`, com OAuth suportado pelo cliente.
- **Cloudflare:** endpoint remoto oficial `https://mcp.cloudflare.com/mcp`, com OAuth e permissões concedidas pelo usuário.
- Acesso a Workers, D1, repositórios e demais recursos por meio dos MCPs oficiais, respeitando as permissões aprovadas.
- Não replicar ferramentas dos provedores, não criar proxy MCP próprio, nem gerenciar manualmente credenciais ou renovação de tokens para esses acessos quando o cliente OAuth cuidar disso.
- Usar escopos mínimos necessários, privilegiando leitura e elevando permissões de escrita apenas conforme a tarefa.

## Papel do repositório

- Conservar **skills, instruções, documentação e procedimentos de uso** (incluindo Ponto, Gastos e Desenvolvimento) como material declarativo.
- Acessar os bancos D1 de Ponto e Gastos **somente pelo MCP Cloudflare oficial**, validando a identidade do banco antes de qualquer escrita.
- Não adicionar framework, infraestrutura ou serviços próprios sem necessidade demonstrada.
- A única fonte de verdade deste projeto continua sendo este repositório.

## Estado atual versus destino

O estado atual ainda inclui um Worker `assistente` que publica um MCP próprio, encaminha requisições e mantém lógica de OAuth. **Esse é o legado a simplificar, não a arquitetura desejada**. A publicação existente não foi desativada por esta decisão.

## Critérios antes de desativar o legado

1. Confirmar GitHub e Cloudflare conectados **diretamente** pelo cliente, com OAuth e permissões adequadas.
2. Validar consultas e operações permitidas, incluindo workflows de Ponto e Gastos, sem gravar dados de teste nos bancos pessoais.
3. Garantir que as skills/instruções continuem acessíveis sem depender do Worker intermediário.
4. Desativar o Worker e remover recursos, configurações e segredos **somente mediante autorização específica**, após validar que não há dependências restantes.
5. Atualizar README e documentação técnica para refletir o estado efetivo após a migração.

**Regra:** sem expandir funcionalidades agora; priorizar confiabilidade operacional, segurança e simplicidade.
