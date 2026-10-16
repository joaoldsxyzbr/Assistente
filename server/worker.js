import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";
import { createOAuthMcpWorker } from "./shared/oauth-mcp-worker.js";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";
import { registerRemoteTools, remoteToolNames } from "./remote-tools.js";
import { readRemoteConfiguration } from "./remote-client.js";

export function createAssistenteMcpServer(env = {}) {
  const server = new McpServer({ name: "assistente", version: "1.1.0" }, { instructions: MCP_SERVER_INSTRUCTIONS });
  server.registerTool("assistente_status", {
    description: "Mostra skills e configuração de autorização dos MCPs oficiais, sem revelar segredos.",
    inputSchema: fromJsonSchema({ type:"object", properties:{}, additionalProperties:false }),
    _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
  }, async () => ({ content: [{type:"text",text:JSON.stringify({
    skills: SKILL_NAMES,
    mcp: ["github","cloudflare"].map(id=>({id,credential_configured:!!readRemoteConfiguration(env,id)})),
    aviso: "OAuth de cada MCP remoto deve ser autorizado e configurado separadamente."
  })}] }));
  server.registerTool("assistente_skill", {
    description: "Consulta instruções de ponto, gastos e desenvolvimento.",
    inputSchema: fromJsonSchema({type:"object",properties:{nome:{type:"string",enum:SKILL_NAMES}},required:["nome"],additionalProperties:false}),
    _meta: {securitySchemes:oauthSecuritySchemesForTool(false)}
  }, async ({nome}) => ({content:[{type:"text",text:SKILL_CONTENTS[nome] ?? "Skill indisponível."}]}));
  registerRemoteTools(server,env,fromJsonSchema,oauthSecuritySchemesForTool);
  return server;
}
const provider = createOAuthMcpWorker({
  createServer:createAssistenteMcpServer,
  resource:"https://assistente.joaolds.xyz.br/mcp",
  resourceName:"Assistente MCP",
  writeToolNames:remoteToolNames
});
export default {fetch(request,env,ctx){return provider.fetch(request,env,ctx);}};
