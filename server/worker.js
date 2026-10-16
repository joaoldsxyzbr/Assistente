import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";
import { createOAuthMcpWorker } from "./shared/oauth-mcp-worker.js";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";

export function createAssistenteMcpServer() {
  const server = new McpServer({ name: "assistente", version: "1.0.0" }, { instructions: MCP_SERVER_INSTRUCTIONS });
  server.registerTool("assistente_status", {
    description: "Informa quais skills estão disponíveis e como conectar os MCPs oficiais. Não consulta serviços externos.",
    inputSchema: fromJsonSchema({ type: "object", properties: {}, additionalProperties: false }),
    _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
  }, async () => ({ content: [{ type: "text", text: JSON.stringify({
    modo: "skills", skills: SKILL_NAMES, conexoes: ["GitHub MCP oficial (OAuth direto no ChatGPT)", "Cloudflare MCP oficial (OAuth direto no ChatGPT)"],
    aviso: "OAuth de um MCP não concede acesso automático a outro MCP."
  }) }] }));
  server.registerTool("assistente_skill", {
    description: "Lê uma skill do repositório: ponto, gastos ou desenvolvimento. Sem acesso a dados externos.",
    inputSchema: fromJsonSchema({
      type: "object", properties: { nome: { type: "string", enum: SKILL_NAMES } },
      required: ["nome"], additionalProperties: false
    }),
    _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
  }, async ({ nome }) => ({ content: [{ type: "text", text: SKILL_CONTENTS[nome] ?? "Skill indisponível." }] }));
  return server;
}

const oauthWorker = createOAuthMcpWorker({
  createServer: createAssistenteMcpServer,
  resource: "https://assistente.joaolds.xyz.br/mcp",
  resourceName: "Assistente MCP — Skills",
  writeToolNames: []
});
export default { fetch(request, env, ctx) { return oauthWorker.fetch(request, env, ctx); } };
