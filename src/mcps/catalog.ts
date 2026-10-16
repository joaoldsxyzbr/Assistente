import { CLOUDFLARE_TOOL_CATALOG } from "./cloudflare/tools.ts";
import { GITHUB_TOOL_CATALOG } from "./github/tools.ts";
import type { McpToolContract } from "./contracts.ts";

export const MCP_TOOL_CATALOG: readonly McpToolContract[] = [
  ...CLOUDFLARE_TOOL_CATALOG,
  ...GITHUB_TOOL_CATALOG,
];
