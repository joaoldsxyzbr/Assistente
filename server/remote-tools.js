import { readRemoteConfiguration, withRemoteClient } from "./remote-client.js";

const PROVIDERS = ["github", "cloudflare"];
export const remoteToolNames = PROVIDERS.map(provider => "mcp_" + provider + "_call");
function fail(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}
export function safeResult(response) {
  // The official client already validates MCP content. Preserve its types and JSON.
  const result = { isError: response.isError ?? false, content: response.content ?? [] };
  if (response.structuredContent !== undefined) result.structuredContent = response.structuredContent;
  if (response._meta !== undefined) result._meta = response._meta;
  return result;
}
export function registerRemoteTools(server, env, fromJsonSchema, securitySchemes) {
  for (const provider of PROVIDERS) {
    server.registerTool("mcp_" + provider + "_tools", {
      description: "Lista, em tempo real, as ferramentas publicadas pelo MCP oficial " + provider + ".",
      inputSchema: fromJsonSchema({ type: "object", properties: {}, additionalProperties: false }),
      _meta: { securitySchemes: securitySchemes(false) }
    }, async () => {
      const config = await readRemoteConfiguration(env, provider);
      if (!config) return fail("OAuth upstream não conectado para " + provider + ". Consulte assistente_status.");
      try {
        const value = await withRemoteClient(config, client => client.listTools(undefined, { timeout: 15000 }));
        return { content: [{ type: "text", text: JSON.stringify(value.tools) }] };
      } catch {
        return fail("Não foi possível consultar o MCP oficial " + provider + ". Verifique a conexão OAuth.");
      }
    });
    server.registerTool("mcp_" + provider + "_call", {
      description: "Encaminha uma chamada ao MCP oficial " + provider + " sem copiar ou redefinir a ferramenta. Exige escopo mcp:write por segurança.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 128 },
          arguments: { type: "object", additionalProperties: true }
        },
        required: ["name", "arguments"],
        additionalProperties: false
      }),
      _meta: { securitySchemes: securitySchemes(true) }
    }, async ({ name, arguments: args }) => {
      const config = await readRemoteConfiguration(env, provider);
      if (!config) return fail("OAuth upstream não conectado para " + provider + ". Consulte assistente_status.");
      try {
        return await withRemoteClient(config, async client => {
          const tools = (await client.listTools(undefined, { timeout: 15000 })).tools;
          if (!tools.some(tool => tool.name === name)) return fail("A ferramenta não foi publicada pelo MCP oficial.");
          return safeResult(await client.callTool({ name, arguments: args }, { timeout: 45000 }));
        });
      } catch {
        return fail("A chamada remota não foi confirmada. Se era escrita, consulte o provedor antes de repetir.");
      }
    });
  }
}
