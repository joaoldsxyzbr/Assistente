# Publicar ZIP do plugin Assistente

O ZIP instalável contém `plugin.json`, `.app.json`, `.codex-plugin/` e `skills/` na raiz, sem a pasta `plugin/` como nível adicional. O ZIP do repositório inteiro não serve para essa instalação.

Para criar a Release: **Actions → Publicar ZIP do plugin Assistente → Run workflow**, escolhendo a branch `main`. O workflow valida os arquivos, gera o ZIP com `git archive HEAD:plugin`, confere os manifestos, cria um SHA-256 e anexa ambos em **Releases**.

O workflow não modifica o Worker, o OAuth nem os bancos, e não sobrescreve uma Release existente.
