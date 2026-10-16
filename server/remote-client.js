import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { getUpstreamAccessToken } from "./upstream-oauth.js";
import { githubProvider } from "../mcps/github/index.js";
import { cloudflareProvider } from "../mcps/cloudflare/index.js";
import { fetchUpstream } from "./shared/upstream-http.js";

const PROVIDERS = Object.freeze({
  github: githubProvider,
  cloudflare: cloudflareProvider
});
export function endpointFor(id) {
  return PROVIDERS[id]?.endpoint ?? null;
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
    requestInit: { redirect: "manual", headers: { authorization: "Bearer " + config.token } },
    fetch: (url, init) => fetchUpstream(fetch, url, init, init?.method === "DELETE" ? 5000 : 45000)
  });
  try {
    await client.connect(transport, { timeout: 15000 });
    return await fn(client);
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
  }
}
