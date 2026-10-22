import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";
import { registerCloudflareTools, registerCloudflareOperations } from "../mcps/cloudflare/index.js";
import { registerGithubRelocation, registerGithubExactEdit, registerGithubDirectTools, registerGithubOperations } from "../mcps/github/index.js";
import { hasUpstreamConnection } from "./upstream-oauth.js";
import {createToolDiagnostics} from "./shared/tool-diagnostics.js";
import {githubDirectTools} from "../mcps/github/tools/contratos.js";
import {cloudflareTools} from "../mcps/cloudflare/tools/contratos.js";
import {githubOperationWriteNames} from "../mcps/github/index.js";
import {cloudflareOperationWriteNames} from "../mcps/cloudflare/index.js";

const MCP_SERVER_INSTRUCTIONS = "Assistente MCPs publica apenas ferramentas próprias GitHub e Cloudflare. OAuth e MCP oficiais permanecem exclusivamente no backend. Não expor ferramentas genéricas dos MCPs oficiais. Use github_edit_file com dryRun e SHA para edições seguras. Se uma operação específica ainda não estiver disponível, informe a limitação. Nunca repita uma escrita incerta sem reconciliar o estado.";

export function createAssistenteMcpServer(env = {}, traceId) {
  const server = new McpServer({ name: "assistente", version: "1.1.0" }, { instructions: MCP_SERVER_INSTRUCTIONS });
  server.registerTool("assistente_status", {
    description: "Mostra conexões OAuth upstream e links seguros para conectar ou desconectar provedores, sem revelar segredos.",
    inputSchema: fromJsonSchema({ type: "object", properties: {}, additionalProperties: false }),
    _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
  }, async () => {
    const diagnostic=createToolDiagnostics({provider:"assistente",tool:"assistente_status",traceId});
    diagnostic.stage("oauth");
    try {
    const connections = await Promise.all(["github", "cloudflare"].map(async id => ({
      id,
      connected: await hasUpstreamConnection(env, id),
      verification: "stored_token",
      connect_url: (env.PUBLIC_ORIGIN || "https://assistente.joaolds.xyz.br") + "/connections/" + id + "/start",
      disconnect_url: (env.PUBLIC_ORIGIN || "https://assistente.joaolds.xyz.br") + "/connections/" + id + "/disconnect"
    })));
    diagnostic.stage("normalization");
    return diagnostic.done({ content: [{ type: "text", text: JSON.stringify({ connections }) }] });
    } catch(error) {diagnostic.fail(error);throw error;}
  });
  // First register directly instrumented read tools.
  registerCloudflareTools(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubDirectTools(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);

  // Older and specialized operations keep their original handlers and contracts.
  // This boundary ensures every public tool still emits one summary event.
  const directNames = new Set([...githubDirectTools, ...cloudflareTools].map(x => x.name));
  const writeNames = new Set(["github_relocate_directory", "github_edit_file",
    ...githubOperationWriteNames, ...cloudflareOperationWriteNames]);
  const originalRegister = server.registerTool.bind(server);
  server.registerTool = (name, definition, handler) => {
    if (directNames.has(name)) return originalRegister(name, definition, handler);
    return originalRegister(name, definition, async (...args) => {
      const provider = name.startsWith("github_") ? "github" :
        name.startsWith("cloudflare_") ? "cloudflare" : "assistente";
      const diagnostic = createToolDiagnostics({tool:name,provider,write:writeNames.has(name),traceId});
      // Specialized handlers do not expose internal phase transitions.
      // Use a conservative upstream/uncertain label for writes that return errors.
      diagnostic.stage("upstream");
      try {
        const result = await handler(...args);
        if (!result?.isError) diagnostic.stage("normalization");
        return diagnostic.done(result);
      } catch (error) {
        diagnostic.fail(error);
        throw error;
      }
    });
  };
  registerCloudflareOperations(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubRelocation(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubExactEdit(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  registerGithubOperations(server, env, fromJsonSchema, oauthSecuritySchemesForTool, traceId);
  return server;
}