/** Operações intencionalmente específicas: sem shell nem execução arbitrária. */
export interface PcTool {
  name: string;
  description: string;
  isWrite: boolean;
  inputSchema: Record<string, unknown>;
}
const empty = { type: "object", properties: {}, additionalProperties: false };
const textArg = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
export const PC_TOOL_CATALOG: readonly PcTool[] = [
  { name: "pc_status", description: "Consulta se o Windows está conectado e disponível.", isWrite: false, inputSchema: empty },
  { name: "pc_janelas", description: "Lista os títulos das janelas visíveis no Windows.", isWrite: false, inputSchema: empty },
  { name: "pc_tela", description: "Captura a tela ativa em JPEG; o conteúdo pode ser sensível.", isWrite: false, inputSchema: empty },
  { name: "pc_abrir", description: "Abre um aplicativo permitido: bloco_de_notas, calculadora ou explorador.", isWrite: true,
    inputSchema: { type: "object", properties: { aplicativo: { type: "string", enum: ["bloco_de_notas", "calculadora", "explorador"] } }, required: ["aplicativo"], additionalProperties: false } },
  { name: "pc_clicar", description: "Clica em coordenadas da tela principal; observe a tela antes de clicar.", isWrite: true,
    inputSchema: { type: "object", properties: { x: { type: "integer", minimum: 0, maximum: 16384 }, y: { type: "integer", minimum: 0, maximum: 16384 } }, required: ["x", "y"], additionalProperties: false } },
  { name: "pc_digitar", description: "Digita texto Unicode na janela ativa; não utilize para credenciais.", isWrite: true,
    inputSchema: { type: "object", properties: { texto: textArg(500) }, required: ["texto"], additionalProperties: false } },
  { name: "pc_tecla", description: "Envia um atalho aprovado: ENTER, TAB, ESC, CTRL+S, CTRL+C, CTRL+V, CTRL+A ou ALT+TAB.", isWrite: true,
    inputSchema: { type: "object", properties: { atalho: { type: "string", enum: ["ENTER", "TAB", "ESC", "CTRL+S", "CTRL+C", "CTRL+V", "CTRL+A", "ALT+TAB"] } }, required: ["atalho"], additionalProperties: false } },
];
export const isPcWrite = (name: string): boolean => PC_TOOL_CATALOG.some((item) => item.name === name && item.isWrite);
export const isPcTool = (name: string): boolean => PC_TOOL_CATALOG.some((item) => item.name === name);
export function pcResultToMcp(raw: unknown): { isError: boolean; content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> } {
  if (!raw || typeof raw !== "object" || !("ok" in raw)) {
    return { isError: true, content: [{ type: "text", text: "Resposta inválida do computador." }] };
  }
  const result = raw as { ok: boolean; data?: unknown; image?: string; error?: string };
  if (result.ok && typeof result.image === "string" && result.image.length <= 1_400_000 && /^[A-Za-z0-9+/=]+$/.test(result.image)) {
    return { isError: false, content: [{ type: "image", data: result.image, mimeType: "image/jpeg" }] };
  }
  if (!result.ok) return { isError: true, content: [{ type: "text", text: typeof result.error === "string" ? result.error.slice(0, 120) : "Falha no computador." }] };
  return { isError: false, content: [{ type: "text", text: JSON.stringify(result.data ?? {}) }] };
}
