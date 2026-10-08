export const MCP_SERVER_CATALOG = [
  {
    id: "cloudflare",
    label: "Cloudflare MCP",
    endpointVariable: "MCP_CLOUDFLARE_URL",
    tokenVariable: "MCP_CLOUDFLARE_TOKEN",
  },
  {
    id: "github",
    label: "GitHub MCP",
    endpointVariable: "MCP_GITHUB_URL",
    tokenVariable: "MCP_GITHUB_TOKEN",
  },
] as const;

export type McpServerId = (typeof MCP_SERVER_CATALOG)[number]["id"];
