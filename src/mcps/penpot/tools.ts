import type { McpToolContract } from "../contracts.ts";

// Remote Penpot MCP: https://help.penpot.app/mcp/
// No local file-system tools are exposed. execute_code can both READ and WRITE
// to the connected design, so it must always request the write OAuth scope.
const sessionId = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  description: "Sessão Penpot selecionada. Opcional quando somente uma aba está conectada.",
};

export const PENPOT_TOOL_CATALOG: readonly McpToolContract[] = [
  {
    serverId: "penpot",
    name: "high_level_overview",
    description: "Instruções gerais e visão da API de design do Penpot.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "penpot",
    name: "penpot_api_info",
    description: "Consulta documentação de tipos e membros da API de plugins do Penpot.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", minLength: 1 },
        member: { type: "string" },
      },
      required: ["type"],
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "penpot",
    name: "execute_code",
    description: "Executa JavaScript na sessão Penpot conectada. Pode consultar, criar, alterar ou EXCLUIR elementos; exija autorização para modificações.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", minLength: 1 },
        sessionId,
      },
      required: ["code"],
      additionalProperties: false,
    },
    isWrite: true,
  },
  {
    serverId: "penpot",
    name: "export_shape",
    description: "Exporta uma forma, seleção ou página conectada no Penpot; não grava arquivos locais.",
    inputSchema: {
      type: "object",
      properties: {
        shapeId: { type: "string", minLength: 1, description: "ID da forma, selection ou page." },
        format: { type: "string", enum: ["png", "svg"] },
        mode: { type: "string", enum: ["shape", "fill"] },
        sessionId,
      },
      required: ["shapeId"],
      additionalProperties: false,
    },
    isWrite: false,
  },
];
