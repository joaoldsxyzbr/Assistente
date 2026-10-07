export const MCP_SERVER_CATALOG = [
  {
    id: "ponto",
    label: "Controle de ponto",
    endpointVariable: "MCP_PONTO_URL",
    tokenVariable: "MCP_PONTO_TOKEN",
  },
  {
    id: "gastos",
    label: "Controle de gastos",
    endpointVariable: "MCP_GASTOS_URL",
    tokenVariable: "MCP_GASTOS_TOKEN",
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    endpointVariable: "MCP_CLOUDFLARE_URL",
    tokenVariable: "MCP_CLOUDFLARE_TOKEN",
  },
  {
    id: "deskpilot",
    label: "DeskPilot",
    endpointVariable: "MCP_DESKPILOT_URL",
    tokenVariable: "MCP_DESKPILOT_TOKEN",
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
