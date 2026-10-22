import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";
import { registerRemoteTools } from "./remote-tools.js";
import { registerGithubRelocation } from "../mcps/github/index.js";
import { registerGithubExactEdit } from "../mcps/github/index.js";
import { hasUpstreamConnection } from "./upstream-oauth.js";

const MCP_SERVER_INSTRUCTIONS = "Assistente MCPs é um único Worker com uma ponte dinâmica para os MCPs oficiais GitHub e Cloudflare. Use mcp_github_tools e mcp_cloudflare_tools para descobrir as ferramentas publicadas em tempo real e mcp_github_call / mcp_cloudflare_call para encaminhar chamadas sem copiar ou redefinir ferramentas. As conexões upstream exigem OAuth independente e podem estar indisponíveis até a autorização; não peça ao usuário para colar tokens no chat. Consulte assistente_status para estado e links de conexão. Toda chamada remota genérica exige escopo mcp:write do Assistente, mesmo quando apenas leitura. Nunca repita escrita incerta sem reconciliação.";

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
  return server;
}