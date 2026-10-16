import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { getUpstreamAccessToken } from "./upstream-oauth.js";

const HOSTS = Object.freeze({
  github: "https://api.githubcopilot.com/mcp/x/all",
  cloudflare: "https://mcp.cloudflare.com/mcp"
});
export function endpointFor(id) {
  return HOSTS[id] ?? null;
}
export async function readRemoteConfiguration(env, id) {
  const endpoint = endpointFor(id);
  if (!endpoint) throw Error("UNKNOWN_PROVIDER");
  const token = await getUpstreamAccessToken(env, id);
  if (!token) return null;
  return { id, endpoint, token };
}
export async function withRemoteClient(config, fn) {
  const client = new Client({ name: "assistente-hub", version: "1.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(config.endpoint), {
    requestInit: { headers: { authorization: "Bearer " + config.token } }
  });
  try {
    await client.connect(transport, { timeout: 15000 });
    return await fn(client);
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
  }
}
