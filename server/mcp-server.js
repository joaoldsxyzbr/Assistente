import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";
import { registerRemoteTools } from "./remote-tools.js";
import { registerGithubRelocation, registerGithubExactEdit, registerGithubDirectTools } from "../mcps/github/index.js";
import { hasUpstreamConnection } from "./upstream-oauth.js";

const MCP_SERVER_INSTRUCTIONS = "Assistente MCPs conecta ao GitHub e Cloudflare oficiais por OAuth. Use preferencialmente as ferramentas github_* diretas para tarefas comuns e github_edit_file para editar trechos com prévia e validação de SHA. Para ferramentas sem atalho use mcp_github_tools e mcp_github_call; para Cloudflare use mcp_cloudflare_tools e mcp_cloudflare_call. As conexões exigem OAuth independente; não solicite tokens no chat. Consulte assistente_status para diagnóstico. O fallback genérico exige mcp:write inclusive para leituras, pois pode alterar recursos. Nunca repita escrita incerta sem reconciliação.";

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
  registerRemoteTools(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubRelocation(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubExactEdit(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubDirectTools(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  return server;
}
