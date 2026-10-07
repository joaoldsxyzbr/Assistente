export const MCP_SERVER_CATALOG = [
  {
    id: "cloudflare",
    label: "Cloudflare MCP",
    endpointVariable: "MCP_CLOUDFLARE_URL",
    tokenVariable: "MCP_CLOUDFLARE_TOKEN",
  },
] as const;

export type McpServerId = (typeof MCP_SERVER_CATALOG)[number]["id"];
