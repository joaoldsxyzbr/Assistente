import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type {
  McpClient,
  McpToolCallResult,
  McpToolDefinition,
} from "./contracts.ts";
import type { ConfiguredMcpServer } from "./config.ts";

function asInputSchema(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("MCP tool returned an invalid input schema");
  }

  const schema: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    schema[key] = Reflect.get(value, key);
  }
  return schema;
}

export class RemoteMcpClient implements McpClient {
  readonly #client: Client;
  readonly #transport: StreamableHTTPClientTransport;
  #connected = false;

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

  async connect(): Promise<void> {
    if (this.#connected) {
      return;
    }
    await this.#client.connect(this.#transport);
    this.#connected = true;
  }

  async listTools(): Promise<readonly McpToolDefinition[]> {
    await this.connect();
    const result = await this.#client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: asInputSchema(tool.inputSchema),
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    await this.connect();
    return this.#client.callTool({ name, arguments: args });
  }

  async close(): Promise<void> {
    try {
      await this.#transport.terminateSession();
    } finally {
      await this.#client.close();
      this.#connected = false;
    }
  }
}
