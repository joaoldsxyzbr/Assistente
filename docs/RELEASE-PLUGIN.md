# Publicar ZIP do plugin Assistente

O ZIP instalável contém `plugin.json`, `.app.json`, `.codex-plugin/` e `skills/` na raiz, sem a pasta `plugin/` como nível adicional. O ZIP do repositório inteiro não serve para essa instalação.

## Gerar uma Release permanente

1. Acesse **GitHub → Actions → CI → Run workflow**.
2. Escolha a branch **main**.
3. Marque **Publicar ZIP instalável do Assistente em GitHub Releases**.
4. Confirme o disparo. Após os testes passarem, a Release `plugin-v<versão>` conterá o arquivo `Assistente-plugin-v<versão>.zip` e o checksum SHA-256.

O fluxo usa apenas ferramentas oficiais, não modifica o Worker, OAuth ou banco de dados, e nunca sobrescreve uma Release existente.
