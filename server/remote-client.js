import {
  Client,
  StreamableHTTPClientTransport
} from "@modelcontextprotocol/client";
const GITHUB_REMOTE_TOOLSETS = "context,repos,issues,pull_requests,actions";
const MCP_CONNECT_TIMEOUT_MS = 15e3;
const MCP_TOOL_TIMEOUT_MS = 45e3;
function remoteMcpHeaders(configuration) {
  return {
    Authorization: `Bearer ${configuration.bearerToken}`,
    ...configuration.id === "github" ? { "X-MCP-Toolsets": GITHUB_REMOTE_TOOLSETS } : {}
  };
}
class RemoteMcpClient {
  #client;
  #transport;
  constructor(configuration) {
    this.#client = new Client({ name: "assistente-host", version: "0.1.0" });
    this.#transport = new StreamableHTTPClientTransport(
      new URL(configuration.endpoint),
      {
        requestInit: {
          headers: remoteMcpHeaders(configuration)
        }
      }
    );
  }
  connect() {
    return this.#client.connect(this.#transport, { timeout: MCP_CONNECT_TIMEOUT_MS });
  }
  callTool(name, args) {
    return this.#client.callTool({ name, arguments: args }, { timeout: MCP_TOOL_TIMEOUT_MS });
  }
  async close() {
    try {
      await this.#transport.terminateSession();
    } finally {
      await this.#client.close();
    }
  }
}
export {
  GITHUB_REMOTE_TOOLSETS,
  MCP_CONNECT_TIMEOUT_MS,
  MCP_TOOL_TIMEOUT_MS,
  RemoteMcpClient,
  remoteMcpHeaders
};
