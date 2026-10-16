const CLOUDFLARE_TOOL_CATALOG = [
  {
    serverId: "cloudflare",
    name: "docs",
    description: "Pesquisa a documenta\xE7\xE3o de produtos e recursos da Cloudflare.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"],
      additionalProperties: false
    },
    isWrite: false
  },
  {
    serverId: "cloudflare",
    name: "search",
    description: "Pesquisa o schema OpenAPI da Cloudflare para localizar a API necess\xE1ria.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" }
      },
      required: ["code"],
      additionalProperties: false
    },
    isWrite: false
  },
  {
    serverId: "cloudflare",
    name: "execute",
    description: "Executa c\xF3digo JavaScript pela Cloudflare MCP contra a API Cloudflare; os efeitos dependem das permiss\xF5es do API Token configurado no MCP.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        code: { type: "string" }
      },
      required: ["code"],
      additionalProperties: false
    },
    isWrite: true
  }
];
function withDefaultCloudflareAccount(remoteName, args, defaultAccountId) {
  if (remoteName !== "execute" || typeof args.account_id === "string" && args.account_id.trim().length > 0 || defaultAccountId === void 0 || defaultAccountId.trim().length === 0) {
    return args;
  }
  return { ...args, account_id: defaultAccountId.trim() };
}
export {
  CLOUDFLARE_TOOL_CATALOG,
  withDefaultCloudflareAccount
};
