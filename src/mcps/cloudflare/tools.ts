import type { McpToolContract } from "../contracts.ts";

export const CLOUDFLARE_TOOL_CATALOG: readonly McpToolContract[] = [
  {
    serverId: "cloudflare",
    name: "docs",
    description: "Pesquisa a documentação de produtos e recursos da Cloudflare.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "cloudflare",
    name: "search",
    description: "Pesquisa o schema OpenAPI da Cloudflare para localizar a API necessária.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
      },
      required: ["code"],
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "cloudflare",
    name: "execute",
    description:
      "Executa código JavaScript pela Cloudflare MCP contra a API Cloudflare; os efeitos dependem das permissões do API Token configurado no MCP.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        code: { type: "string" },
      },
      required: ["code"],
      additionalProperties: false,
    },
    isWrite: true,
  },
];


export function withDefaultCloudflareAccount(
  remoteName: string,
  args: Record<string, unknown>,
  defaultAccountId: string | undefined,
): Record<string, unknown> {
  if (
    remoteName !== "execute" ||
    typeof args.account_id === "string" ||
    defaultAccountId === undefined ||
    defaultAccountId.trim().length === 0
  ) {
    return args;
  }

  return { ...args, account_id: defaultAccountId.trim() };
}
