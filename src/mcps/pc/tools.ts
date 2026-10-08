/** Terminal restrito e Windows UI Automation: sem screenshots, shell arbitrário ou mouse por coordenadas. */
export interface PcTool {
  name: string;
  description: string;
  isWrite: boolean;
  inputSchema: Record<string, unknown>;
}
const empty = { type: "object", properties: {}, additionalProperties: false };
const terminals = ["identidade", "computador", "rede", "processos"] as const;
const actions = ["acionar", "preencher"] as const;

export const PC_TOOL_CATALOG: readonly PcTool[] = [
  { name: "pc_status", description: "Consulta se o Windows está conectado.", isWrite: false, inputSchema: empty },
  { name: "pc_informacoes", description: "Versão do agente, Windows, arquitetura e dimensões da tela, sem capturá-la.", isWrite: false, inputSchema: empty },
  { name: "pc_processos", description: "Lista os nomes dos primeiros 40 processos.", isWrite: false, inputSchema: empty },
  { name: "pc_janelas", description: "Lista até 40 títulos de janelas visíveis.", isWrite: false, inputSchema: empty },
  { name: "pc_terminal", description: "Executa apenas diagnósticos permitidos no terminal, sem shell livre: identidade, computador, rede e processos.", isWrite: false,
    inputSchema: { type: "object", properties: { comando: { type: "string", enum: [...terminals] } }, required: ["comando"], additionalProperties: false } },
  { name: "pc_ui_elementos", description: "Inspeciona os controles acessíveis da janela ativa por Windows UI Automation, sem imagem.", isWrite: false, inputSchema: empty },
  { name: "pc_ui_acao", description: "Aciona um controle acessível por nome/identificador ou preenche campo não sensível na janela ativa.", isWrite: true,
    inputSchema: { type: "object", properties: { alvo: { type: "string", minLength: 1, maxLength: 100 }, acao: { type: "string", enum: [...actions] }, texto: { type: "string", minLength: 1, maxLength: 500 } }, required: ["alvo", "acao"], additionalProperties: false } },
  { name: "pc_abrir", description: "Abre Bloco de Notas, Calculadora ou Explorador.", isWrite: true,
    inputSchema: { type: "object", properties: { aplicativo: { type: "string", enum: ["bloco_de_notas", "calculadora", "explorador"] } }, required: ["aplicativo"], additionalProperties: false } },
  { name: "pc_pasta", description: "Abre pasta conhecida: downloads, documentos, imagens ou area_de_trabalho.", isWrite: true,
    inputSchema: { type: "object", properties: { pasta: { type: "string", enum: ["downloads", "documentos", "imagens", "area_de_trabalho"] } }, required: ["pasta"], additionalProperties: false } },
];
export const isPcWrite = (name: string): boolean => PC_TOOL_CATALOG.some(t => t.name === name && t.isWrite);
export const isPcTool = (name: string): boolean => PC_TOOL_CATALOG.some(t => t.name === name);

/** Validação sem interpretar scripts, argumentos, paths ou comandos enviados pelo modelo. */
export function validPcArguments(name: string, args: unknown): args is Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return false;
  const v = args as Record<string, unknown>;
  const keys = Object.keys(v);
  const only = (...fields: string[]) => keys.length === fields.length && fields.every(f => Object.hasOwn(v, f));
  switch (name) {
    case "pc_status":
    case "pc_informacoes":
    case "pc_processos":
    case "pc_janelas":
    case "pc_ui_elementos": return only();
    case "pc_terminal": return only("comando") && terminals.some(x => x === v.comando);
    case "pc_ui_acao": return (only("alvo", "acao") || only("alvo", "acao", "texto"))
      && typeof v.alvo === "string" && v.alvo.trim().length > 0 && v.alvo.length <= 100
      && actions.some(x => x === v.acao)
      && (v.acao === "preencher"
        ? typeof v.texto === "string" && v.texto.length > 0 && v.texto.length <= 500
        : !Object.hasOwn(v, "texto"));
    case "pc_abrir": return only("aplicativo") && ["bloco_de_notas", "calculadora", "explorador"].includes(v.aplicativo as string);
    case "pc_pasta": return only("pasta") && ["downloads", "documentos", "imagens", "area_de_trabalho"].includes(v.pasta as string);
    default: return false;
  }
}

export function pcResultToMcp(raw: unknown): { isError: boolean; content: Array<{ type: "text"; text: string }> } {
  const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });
  if (!raw || typeof raw !== "object" || !("ok" in raw) || typeof raw.ok !== "boolean")
    return fail("Resposta inválida do computador.");
  const result = raw as { ok: boolean; data?: unknown; image?: unknown; error?: unknown };
  if (!result.ok) return fail(typeof result.error === "string" ? result.error.slice(0, 120) : "Falha no computador.");
  if (result.image !== undefined) return fail("Captura de tela não é permitida.");
  if (result.data === undefined) return fail("Resposta vazia do computador.");
  let text: string;
  try { text = JSON.stringify(result.data); } catch { return fail("Resposta inválida do computador."); }
  if (text === undefined || text.length > 65_536) return fail("Resposta muito grande do computador.");
  return { isError: false, content: [{ type: "text", text }] };
}
