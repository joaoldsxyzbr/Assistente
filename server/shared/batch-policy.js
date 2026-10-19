// Politica conservadora de lotes: uma chamada push_files sempre cria no maximo um commit.
// Nao fragmentar ou repetir gravacoes automaticamente: um timeout pode ocorrer depois do commit.
export const MAX_PUSH_FILES = 8;
export const MAX_PUSH_BYTES = 128 * 1024;
export const DEFAULT_CALL_TIMEOUT_MS = 45_000;
export const LONG_WRITE_TIMEOUT_MS = 90_000;
const encoder = new TextEncoder();

export function remoteCallTimeout(provider, name) {
  return provider === "github" && (name === "push_files" || name === "create_or_update_file")
    ? LONG_WRITE_TIMEOUT_MS : DEFAULT_CALL_TIMEOUT_MS;
}

// Apenas contagem e tamanho UTF-8 sao registrados, nunca nomes, argumentos ou conteudo.
export function remoteCallMetrics(provider, name, args) {
  let inputBytes = 0;
  try { inputBytes = encoder.encode(JSON.stringify(args ?? {})).byteLength; } catch {}
  const isBatch = provider === "github" && name === "push_files";
  const fileCount = isBatch && Array.isArray(args?.files) ? args.files.length : undefined;
  return {
    inputBytes,
    fileCount,
    batch: isBatch,
    tooLarge: isBatch && fileCount !== undefined &&
      (fileCount > MAX_PUSH_FILES || inputBytes > MAX_PUSH_BYTES)
  };
}
