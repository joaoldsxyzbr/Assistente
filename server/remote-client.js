import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const HOSTS = Object.freeze({
  github: "https://api.githubcopilot.com/mcp/",
  cloudflare: "https://mcp.cloudflare.com/mcp"
});
const GITHUB_TOOLSETS = "context,repos,issues,pull_requests,actions";
export function endpointFor(id) { return HOSTS[id] ?? null; }
export function readRemoteConfiguration(env, id) {
  const endpoint = endpointFor(id);
  if (!endpoint) throw Error("UNKNOWN_PROVIDER");
  const token = id === "github" ? env.GITHUB_OAUTH_ACCESS_TOKEN : env.CLOUDFLARE_OAUTH_ACCESS_TOKEN;
  if (typeof token !== "string" || token.trim().length === 0) return null;
  return { id, endpoint, token: token.trim() };
}
export async function withRemoteClient(config, fn) {
  const client = new Client({ name: "assistente-hub", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(config.endpoint), {
    requestInit: { headers: {
      Authorization: "Bearer " + config.token,
      ...(config.id === "github" ? { "X-MCP-Toolsets": GITHUB_TOOLSETS } : {})
    }}
  });
  try {
    await client.connect(transport, { timeout: 15000 });
    return await fn(client);
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
  }
}
