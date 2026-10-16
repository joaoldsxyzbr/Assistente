import { MCP_SERVER_CATALOG } from "./contracts.js";
function environmentString(env, key) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}
function validEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username.length > 0 || url.password.length > 0 || url.search.length > 0 || url.hash.length > 0) {
      return void 0;
    }
    return url.toString();
  } catch {
    return void 0;
  }
}
function readMcpConfigurations(env) {
  return MCP_SERVER_CATALOG.map((server) => {
    const endpointValue = environmentString(env, server.endpointVariable);
    const bearerToken = environmentString(env, server.tokenVariable);
    if (endpointValue.length === 0 && bearerToken.length === 0) {
      return { id: server.id, label: server.label, status: "unconfigured" };
    }
    if (endpointValue.length === 0 || bearerToken.length === 0) {
      return {
        id: server.id,
        label: server.label,
        status: "misconfigured",
        errorCode: "INCOMPLETE_CONFIGURATION"
      };
    }
    const endpoint = validEndpoint(endpointValue);
    const expectedEndpoint = {
      cloudflare: "https://mcp.cloudflare.com/mcp",
      github: "https://api.githubcopilot.com/mcp/"
    }[server.id];
    if (endpoint === void 0 || endpoint !== expectedEndpoint) {
      return {
        id: server.id,
        label: server.label,
        status: "misconfigured",
        errorCode: "INVALID_ENDPOINT"
      };
    }
    return {
      id: server.id,
      label: server.label,
      status: "configured",
      endpoint,
      bearerToken
    };
  });
}
export {
  readMcpConfigurations
};
