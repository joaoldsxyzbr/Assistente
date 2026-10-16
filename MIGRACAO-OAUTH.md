# Migração para OAuth oficial

A arquitetura-alvo corrigida está em [docs/MIGRACAO-OAUTH-OFICIAL.md](docs/MIGRACAO-OAUTH-OFICIAL.md).

**Ponto e gastos são apenas skills.** O ChatGPT usa o MCP oficial Cloudflare com OAuth para acessar os dois D1. O GitHub também usa o MCP oficial diretamente. Nenhum Worker ou binding D1 personalizado faz parte da arquitetura-alvo.

A implementação legada não foi removida; a transição só pode ser concluída quando conexões, skills e comandos estiverem validados.
