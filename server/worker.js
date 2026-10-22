import { createOAuthMcpWorker } from "./shared/oauth-mcp-worker.js";
import { createAssistenteMcpServer } from "./mcp-server.js";
import { githubDirectWriteNames } from "../mcps/github/index.js";

const providers = new Map();
function providerFor(env) {
  const origin = env.PUBLIC_ORIGIN || "https://assistente.joaolds.xyz.br";
  if (!providers.has(origin)) {
    providers.set(origin, createOAuthMcpWorker({
      createServer: createAssistenteMcpServer,
      resource: new URL("/mcp", origin).href,
      resourceName: "Assistente MCP",
      writeToolNames: ["github_relocate_directory", "github_edit_file", ...githubDirectWriteNames]
    }));
  }
  return providers.get(origin);
}
export default { fetch(request, env, ctx) { return providerFor(env).fetch(request, env, ctx); } };