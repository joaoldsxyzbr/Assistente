import type {
  McpClient,
  McpServerId,
  McpToolCallResult,
  McpToolDefinition,
} from "./contracts.ts";
import type { McpServerConfiguration } from "./config.ts";

export type McpClientFactory = (
  configuration: Extract<McpServerConfiguration, { status: "configured" }>,
) => McpClient;

export type ServerStatusCode =
  | "READY"
  | "NOT_CONFIGURED"
  | "INVALID_CONFIGURATION"
  | "MCP_UNAVAILABLE"
  | "INVALID_TOOL_CATALOG";

export interface McpServerStatus {
  id: McpServerId;
  label: string;
  code: ServerStatusCode;
  toolCount: number;
}

export interface HostToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export class AssistenteHostError extends Error {
  readonly code: "TOOL_NOT_FOUND" | "MCP_UNAVAILABLE";

  constructor(
    code: "TOOL_NOT_FOUND" | "MCP_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "AssistenteHostError";
    this.code = code;
  }
}

interface ToolRoute {
  serverId: McpServerId;
  remoteName: string;
}

interface ServerEntry {
  id: McpServerId;
  label: string;
  code: ServerStatusCode;
  client?: McpClient;
  tools: HostToolDefinition[];
}

function qualifiedName(serverId: McpServerId, remoteName: string): string {
  const safeRemoteName = remoteName.replace(/[^A-Za-z0-9_-]/g, "_");
  if (safeRemoteName.length === 0) {
    throw new Error("Tool name cannot be empty after normalization");
  }
  return `mcp_${serverId}__${safeRemoteName}`;
}

export class AssistenteHost {
  readonly #servers = new Map<McpServerId, ServerEntry>();
  readonly #routes = new Map<string, ToolRoute>();

  constructor(
    configurations: readonly McpServerConfiguration[],
    clientFactory: McpClientFactory,
  ) {
    for (const configuration of configurations) {
      if (this.#servers.has(configuration.id)) {
        throw new Error(`Duplicate MCP server id: ${configuration.id}`);
      }

      if (configuration.status === "configured") {
        this.#servers.set(configuration.id, {
          id: configuration.id,
          label: configuration.label,
          code: "MCP_UNAVAILABLE",
          client: clientFactory(configuration),
          tools: [],
        });
      } else {
        this.#servers.set(configuration.id, {
          id: configuration.id,
          label: configuration.label,
          code:
            configuration.status === "unconfigured"
              ? "NOT_CONFIGURED"
              : "INVALID_CONFIGURATION",
          tools: [],
        });
      }
    }
  }

  async connect(): Promise<McpServerStatus[]> {
    const entries = [...this.#servers.values()];

    await Promise.all(entries.map(async (entry) => {
      this.#removeRoutes(entry.id);
      entry.tools = [];

      if (entry.client === undefined) {
        return;
      }

      try {
        await entry.client.connect();
        const tools = await entry.client.listTools();
        const nextTools: HostToolDefinition[] = [];
        const nextRoutes = new Map<string, ToolRoute>();

        for (const tool of tools) {
          const name = qualifiedName(entry.id, tool.name);
          if (nextRoutes.has(name)) {
            throw new Error("Duplicate tool name after normalization");
          }

          nextRoutes.set(name, { serverId: entry.id, remoteName: tool.name });
          nextTools.push({
            name,
            description: tool.description
              ? `${entry.label}: ${tool.description}`
              : entry.label,
            inputSchema: tool.inputSchema,
          });
        }

        for (const [name, route] of nextRoutes) {
          this.#routes.set(name, route);
        }
        entry.tools = nextTools;
        entry.code = "READY";
      } catch {
        entry.tools = [];
        entry.code = "MCP_UNAVAILABLE";
      }
    }));

    return this.getServerStatuses();
  }

  getTools(): HostToolDefinition[] {
    return [...this.#servers.values()].flatMap((entry) => entry.tools);
  }

  getServerStatuses(): McpServerStatus[] {
    return [...this.#servers.values()].map((entry) => ({
      id: entry.id,
      label: entry.label,
      code: entry.code,
      toolCount: entry.tools.length,
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const route = this.#routes.get(name);
    if (route === undefined) {
      throw new AssistenteHostError("TOOL_NOT_FOUND", "MCP tool is not available");
    }

    const server = this.#servers.get(route.serverId);
    if (server?.client === undefined || server.code !== "READY") {
      throw new AssistenteHostError("MCP_UNAVAILABLE", "MCP server is unavailable");
    }

    try {
      return await server.client.callTool(route.remoteName, args);
    } catch {
      // Do not retry writes automatically and do not expose endpoint/token details.
      server.code = "MCP_UNAVAILABLE";
      this.#removeRoutes(server.id);
      server.tools = [];
      throw new AssistenteHostError("MCP_UNAVAILABLE", "MCP server is unavailable");
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.#servers.values()].flatMap((entry) =>
        entry.client === undefined ? [] : [entry.client.close()],
      ),
    );
  }

  #removeRoutes(serverId: McpServerId): void {
    for (const [name, route] of this.#routes) {
      if (route.serverId === serverId) {
        this.#routes.delete(name);
      }
    }
  }
}

export function toolNameForServer(
  serverId: McpServerId,
  tool: McpToolDefinition,
): string {
  return qualifiedName(serverId, tool.name);
}
