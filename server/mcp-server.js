import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { SKILL_NAMES, SKILL_CONTENTS, SKILL_REFERENCES, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";
import { registerRemoteTools } from "./remote-tools.js";
import { registerGithubRelocation } from "./github-relocation.js";
import { registerGithubExactEdit } from "./github-exact-edit.js";
import { hasUpstreamConnection } from "./upstream-oauth.js";

export function createAssistenteMcpServer(env = {}, traceId) {
  const server = new McpServer({ name: "assistente", version: "1.1.0" }, { instructions: MCP_SERVER_INSTRUCTIONS });
  server.registerTool("assistente_status", {
    description: "Mostra skills, conexões OAuth e links seguros para conectar ou desconectar provedores, sem revelar segredos.",
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
    return { content: [{ type: "text", text: JSON.stringify({ skills: SKILL_NAMES, connections }) }] };
  });
  server.registerTool("assistente_skill", {
    description: "Consulta instruções e referências de ponto, gastos e desenvolvimento. Informe arquivo para ler uma referência publicada.",
    inputSchema: fromJsonSchema({
      type: "object",
      properties: {
        nome: { type: "string", enum: SKILL_NAMES },
        arquivo: { type: "string", minLength: 1, maxLength: 80 }
      },
      required: ["nome"],
      additionalProperties: false
    }),
    _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
  }, async ({ nome, arquivo }) => {
    const references = SKILL_REFERENCES[nome] ?? {};
    if (arquivo !== undefined) {
      const text = Object.hasOwn(references, arquivo) ? references[arquivo] : null;
      return { isError: text === null, content: [{ type: "text", text: text ?? "Referência indisponível. Consulte a skill sem arquivo para ver a lista." }] };
    }
    const names = Object.keys(references);
    return { content: [{ type: "text", text: SKILL_CONTENTS[nome] + (names.length ? "\n\nReferências disponíveis via assistente_skill com o mesmo nome e arquivo: " + names.join(", ") : "") }] };
  });
  registerRemoteTools(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubRelocation(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubExactEdit(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  return server;
}