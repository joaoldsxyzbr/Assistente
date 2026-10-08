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
  { name: "pc_informacoes", description: "Informa versão do agente, nome do PC, Windows, arquitetura, tempo ligado e tamanho da tela (sem credenciais).", isWrite: false, inputSchema: empty },
  { name: "pc_processos", description: "Lista até 40 nomes de processos em execução, sem encerrar ou alterar nada.", isWrite: false, inputSchema: empty },
  { name: "pc_janelas", description: "Lista os títulos das janelas visíveis no Windows.", isWrite: false, inputSchema: empty },
  { name: "pc_tela", description: "Captura a tela ativa em JPEG; o conteúdo pode ser sensível.", isWrite: false, inputSchema: empty },
  { name: "pc_abrir", description: "Abre um aplicativo permitido: bloco_de_notas, calculadora ou explorador.", isWrite: true,
    inputSchema: { type: "object", properties: { aplicativo: { type: "string", enum: ["bloco_de_notas", "calculadora", "explorador"] } }, required: ["aplicativo"], additionalProperties: false } },
  { name: "pc_pasta", description: "Abre no Explorador uma pasta conhecida do usuário: downloads, documentos, imagens ou area_de_trabalho.", isWrite: true,
    inputSchema: { type: "object", properties: { pasta: { type: "string", enum: ["downloads", "documentos", "imagens", "area_de_trabalho"] } }, required: ["pasta"], additionalProperties: false } },
  { name: "pc_clicar", description: "Clica na tela principal; permite botão esquerdo/direito e duplo clique (padrão clique esquerdo simples). Observe a tela antes.", isWrite: true,
    inputSchema: { type: "object", properties: { x: { type: "integer", minimum: 0, maximum: 16384 }, y: { type: "integer", minimum: 0, maximum: 16384 }, botao: { type: "string", enum: ["esquerdo", "direito"] }, duplo: { type: "boolean" } }, required: ["x", "y"], additionalProperties: false } },
  { name: "pc_rolar", description: "Rola a janela sob o ponteiro do mouse para cima ou para baixo (1 a 12 passos).", isWrite: true,
    inputSchema: { type: "object", properties: { direcao: { type: "string", enum: ["cima", "baixo"] }, passos: { type: "integer", minimum: 1, maximum: 12 } }, required: ["direcao", "passos"], additionalProperties: false } },
  { name: "pc_digitar", description: "Digita texto Unicode na janela ativa; não utilize para credenciais.", isWrite: true,
    inputSchema: { type: "object", properties: { texto: textArg(500) }, required: ["texto"], additionalProperties: false } },
  { name: "pc_tecla", description: "Envia tecla ou atalho autorizado, como setas, PageUp/Down, F5, Ctrl+F/T/W/L/Z/Y e Alt+Tab.", isWrite: true,
    inputSchema: { type: "object", properties: { atalho: { type: "string", enum: ["ENTER","TAB","ESC","BACKSPACE","DELETE","UP","DOWN","LEFT","RIGHT","PAGEUP","PAGEDOWN","HOME","END","F5","CTRL+S","CTRL+C","CTRL+V","CTRL+A","CTRL+F","CTRL+T","CTRL+W","CTRL+L","CTRL+Z","CTRL+Y","ALT+TAB"] } }, required: ["atalho"], additionalProperties: false } },
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
    case "pc_informacoes":
    case "pc_processos":
    case "pc_janelas":
    case "pc_tela": return only();
    case "pc_abrir": return only("aplicativo") && typeof data.aplicativo === "string"
      && ["bloco_de_notas", "calculadora", "explorador"].includes(data.aplicativo);
    case "pc_pasta": return only("pasta") && typeof data.pasta === "string"
      && ["downloads", "documentos", "imagens", "area_de_trabalho"].includes(data.pasta);
    case "pc_clicar": return keys.length >= 2 && keys.length <= 4
      && keys.every((key) => ["x", "y", "botao", "duplo"].includes(key))
      && Object.hasOwn(data, "x") && Object.hasOwn(data, "y")
      && Number.isInteger(data.x) && Number.isInteger(data.y)
      && (data.x as number) >= 0 && (data.x as number) <= 16384
      && (data.y as number) >= 0 && (data.y as number) <= 16384
      && (!Object.hasOwn(data, "botao") || (typeof data.botao === "string" && ["esquerdo", "direito"].includes(data.botao)))
      && (!Object.hasOwn(data, "duplo") || typeof data.duplo === "boolean")
      && !(data.botao === "direito" && data.duplo === true);
    case "pc_rolar": return only("direcao", "passos")
      && (data.direcao === "cima" || data.direcao === "baixo")
      && Number.isInteger(data.passos) && (data.passos as number) >= 1 && (data.passos as number) <= 12;
    case "pc_digitar": return only("texto") && typeof data.texto === "string"
      && data.texto.length > 0 && data.texto.length <= 500;
    case "pc_tecla": return only("atalho") && typeof data.atalho === "string"
      && ["ENTER","TAB","ESC","BACKSPACE","DELETE","UP","DOWN","LEFT","RIGHT","PAGEUP","PAGEDOWN","HOME","END","F5","CTRL+S","CTRL+C","CTRL+V","CTRL+A","CTRL+F","CTRL+T","CTRL+W","CTRL+L","CTRL+Z","CTRL+Y","ALT+TAB"].includes(data.atalho);
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
