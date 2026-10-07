import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { ConfiguredMcpServer } from "./config.ts";

export class RemoteMcpClient {
  readonly #client: Client;
  readonly #transport: StreamableHTTPClientTransport;

  constructor(configuration: ConfiguredMcpServer) {
    this.#client = new Client({ name: "assistente-host", version: "0.1.0" });
    this.#transport = new StreamableHTTPClientTransport(
      new URL(configuration.endpoint),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${configuration.bearerToken}` },
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
