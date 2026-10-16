import { readRemoteConfiguration, withRemoteClient } from "./remote-client.js";

const PROVIDERS = ["github", "cloudflare"];
export const remoteToolNames = PROVIDERS.map(p => "mcp_" + p + "_call");
function fail(message) { return { isError: true, content: [{type:"text",text:message}] }; }
function safeResult(response) {
  return {isError: response.isError ?? false,
    content: (response.content ?? []).filter(x => x && x.type === "text" && typeof x.text === "string")
      .map(x => ({type:"text",text:x.text.slice(0,200000)}))};
}
export function registerRemoteTools(server, env, fromJsonSchema, securitySchemes) {
  for (const provider of PROVIDERS) {
    server.registerTool("mcp_" + provider + "_tools", {
      description: "Lista as ferramentas disponíveis no MCP oficial " + provider + ". Apenas leitura.",
      inputSchema: fromJsonSchema({type:"object",properties:{},additionalProperties:false}),
      _meta: {securitySchemes: securitySchemes(false)}
    }, async () => {
      const config = readRemoteConfiguration(env, provider);
      if (!config) return fail("OAuth upstream não configurado para " + provider + ".");
      try {
        const value = await withRemoteClient(config, client => client.listTools());
        return {content: [{type:"text",text:JSON.stringify(value.tools.map(x=>({name:x.name,description:x.description,inputSchema:x.inputSchema}))).slice(0,200000)}]};
      } catch {return fail("Não foi possível consultar o MCP oficial "+provider+". Verifique autorização upstream.");}
    });
    server.registerTool("mcp_" + provider + "_call", {
      description: "Executa uma ferramenta do MCP oficial " + provider + " com autorização do próprio provedor. Exige escopo de escrita mesmo quando a ferramenta remota seja apenas leitura.",
      inputSchema: fromJsonSchema({type:"object",properties:{
        name:{type:"string",minLength:1,maxLength:128,pattern:"^[a-zA-Z][a-zA-Z0-9_-]*$"},
        arguments:{type:"object",additionalProperties:true}
      },required:["name","arguments"],additionalProperties:false}),
      _meta: {securitySchemes: securitySchemes(true)}
    }, async ({name,arguments:args}) => {
      const config = readRemoteConfiguration(env, provider);
      if (!config) return fail("OAuth upstream não configurado para " + provider + ".");
      try {
        return await withRemoteClient(config, async client => {
          const tools = (await client.listTools()).tools;
          if (!tools.some(t => t.name === name)) return fail("Ferramenta não autorizada ou inexistente.");
          return safeResult(await client.callTool({name,arguments:args},{timeout:45000}));
        });
      } catch { return fail("Chamada remota não confirmada. Se era escrita, consulte antes de repetir."); }
    });
  }
}
