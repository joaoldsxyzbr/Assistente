export const MCP_SERVER_CATALOG = [
  {
    id: "cloudflare",
    label: "Cloudflare MCP",
    endpointVariable: "MCP_CLOUDFLARE_URL",
    tokenVariable: "MCP_CLOUDFLARE_TOKEN",
  },
] as const;

export type McpServerId = (typeof MCP_SERVER_CATALOG)[number]["id"];

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: readonly unknown[];
  isError?: boolean;
  structuredContent?: unknown;
}

export interface McpClient {
  connect(): Promise<void>;
  listTools(): Promise<readonly McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
  close(): Promise<void>;
}
