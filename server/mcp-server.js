import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";
import { registerCloudflareTools } from "../mcps/cloudflare/index.js";
import { registerGithubRelocation, registerGithubExactEdit, registerGithubDirectTools } from "../mcps/github/index.js";
import { hasUpstreamConnection } from "./upstream-oauth.js";

const MCP_SERVER_INSTRUCTIONS = "Assistente MCPs publica apenas ferramentas próprias GitHub e Cloudflare. OAuth e MCP oficiais permanecem exclusivamente no backend. Não expor ferramentas genéricas dos MCPs oficiais. Use github_edit_file com dryRun e SHA para edições seguras. Se uma operação específica ainda não estiver disponível, informe a limitação. Nunca repita uma escrita incerta sem reconciliar o estado.";

export function createAssistenteMcpServer(env = {}, traceId) {
  const server = new McpServer({ name: "assistente", version: "1.1.0" }, { instructions: MCP_SERVER_INSTRUCTIONS });
  server.registerTool("assistente_status", {
    description: "Mostra conexões OAuth upstream e links seguros para conectar ou desconectar provedores, sem revelar segredos.",
    inputSchema: fromJsonSchema({ type: "object", properties: {}, additionalProperties: false }),
    _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
  }, async () => {
    const connections = await Promise.all(["github", "cloudflare"].map(async id => ({
      id,
      connected: await hasUpstreamConnection(env, id),
      verification: "stored_token",
      connect_url: (env.PUBLIC_ORIGIN || "https://assistente.joaolds.xyz.br") + "/connections/" + id + "/start",
      disconnect_url: (env.PUBLIC_ORIGIN || "https://assistente.joaolds.xyz.br") + "/connections/" + id + "/disconnect"
    })));
    return { content: [{ type: "text", text: JSON.stringify({ connections }) }] };
  });
  registerCloudflareTools(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubRelocation(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubExactEdit(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubDirectTools(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  return server;
}