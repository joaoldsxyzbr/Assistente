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

/** Segurança na fronteira: validar mesmo quando o cliente MCP anuncia um schema. */
export function validPcArguments(name: string, args: unknown): args is Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return false;
  const data = args as Record<string, unknown>;
  const keys = Object.keys(data);
  const only = (...fields: string[]) => keys.length === fields.length && fields.every((field) => Object.hasOwn(data, field));
  switch (name) {
    case "pc_status":
    case "pc_janelas":
    case "pc_tela": return only();
    case "pc_abrir": return only("aplicativo") && typeof data.aplicativo === "string"
      && ["bloco_de_notas", "calculadora", "explorador"].includes(data.aplicativo);
    case "pc_clicar": return only("x", "y")
      && Number.isInteger(data.x) && Number.isInteger(data.y)
      && (data.x as number) >= 0 && (data.x as number) <= 16384
      && (data.y as number) >= 0 && (data.y as number) <= 16384;
    case "pc_digitar": return only("texto") && typeof data.texto === "string"
      && data.texto.length > 0 && data.texto.length <= 500;
    case "pc_tecla": return only("atalho") && typeof data.atalho === "string"
      && ["ENTER", "TAB", "ESC", "CTRL+S", "CTRL+C", "CTRL+V", "CTRL+A", "ALT+TAB"].includes(data.atalho);
    default: return false;
  }
}

export function pcResultToMcp(raw: unknown): { isError: boolean; content: Array<
  { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
> } {
  const error = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });
  if (!raw || typeof raw !== "object" || !("ok" in raw) || typeof raw.ok !== "boolean") {
    return error("Resposta inválida do computador.");
  }
  const result = raw as { ok: boolean; data?: unknown; image?: unknown; error?: unknown };
  if (!result.ok) {
    return error(typeof result.error === "string" ? result.error.slice(0, 120) : "Falha no computador.");
  }
  if (result.image !== undefined) {
    const value = result.image;
    if (typeof value !== "string" || value.length < 4 || value.length > 1_350_000
      || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      return error("Imagem inválida recebida do computador.");
    }
    return { isError: false, content: [{ type: "image", data: value, mimeType: "image/jpeg" }] };
  }
  if (result.data === undefined) return error("Resposta vazia do computador.");
  let text: string;
  try { text = JSON.stringify(result.data); } catch { return error("Resposta inválida do computador."); }
  if (text === undefined || text.length > 65_536) return error("Resposta muito grande do computador.");
  return { isError: false, content: [{ type: "text", text }] };
}
