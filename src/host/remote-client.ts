import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { ConfiguredMcpServer } from "./config.ts";

// Seleção por domínio; o controle de acesso a repositórios é do GitHub token.
export const GITHUB_REMOTE_TOOLSETS = "context,repos,issues,pull_requests,actions";

export function remoteMcpHeaders(configuration: ConfiguredMcpServer): Record<string, string> {
  return {
    Authorization: `Bearer ${configuration.bearerToken}`,
    ...(configuration.id === "github"
      ? { "X-MCP-Toolsets": GITHUB_REMOTE_TOOLSETS }
      : {}),
  };
}

export class RemoteMcpClient {
  readonly #client: Client;
  readonly #transport: StreamableHTTPClientTransport;

  constructor(configuration: ConfiguredMcpServer) {
    this.#client = new Client({ name: "assistente-host", version: "0.1.0" });
    this.#transport = new StreamableHTTPClientTransport(
      new URL(configuration.endpoint),
      {
        requestInit: {
          headers: remoteMcpHeaders(configuration),
        },
      },
    );
  }

  connect(): Promise<void> {
    return this.#client.connect(this.#transport);
  }

  callTool(name: string, args: Record<string, unknown>) {
    return this.#client.callTool({ name, arguments: args });
  }

  async close(): Promise<void> {
    try {
      await this.#transport.terminateSession();
    } finally {
      await this.#client.close();
    }
  }
}
