import { CLOUDFLARE_TOOL_CATALOG } from "./cloudflare/tools.js";
import { GITHUB_TOOL_CATALOG } from "./github/tools.js";
const MCP_TOOL_CATALOG = [
  ...CLOUDFLARE_TOOL_CATALOG,
  ...GITHUB_TOOL_CATALOG
];
export {
  MCP_TOOL_CATALOG
};
