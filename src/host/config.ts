import { MCP_SERVER_CATALOG, type McpServerId } from "./contracts.ts";

export interface ConfiguredMcpServer {
  id: McpServerId;
  label: string;
  status: "configured";
  endpoint: string;
  bearerToken: string;
}

export interface UnconfiguredMcpServer {
  id: McpServerId;
  label: string;
  status: "unconfigured";
}

export interface MisconfiguredMcpServer {
  id: McpServerId;
  label: string;
  status: "misconfigured";
  errorCode: "INCOMPLETE_CONFIGURATION" | "INVALID_ENDPOINT";
}

export type McpServerConfiguration =
  | ConfiguredMcpServer
  | UnconfiguredMcpServer
  | MisconfiguredMcpServer;

export type Environment = Readonly<Record<string, unknown>>;

function environmentString(env: Environment, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function validEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

export function readMcpConfigurations(env: Environment): McpServerConfiguration[] {
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
        errorCode: "INCOMPLETE_CONFIGURATION",
      };
    }

    const endpoint = validEndpoint(endpointValue);
    if (endpoint === undefined) {
      return {
        id: server.id,
        label: server.label,
        status: "misconfigured",
        errorCode: "INVALID_ENDPOINT",
      };
    }

    return {
      id: server.id,
      label: server.label,
      status: "configured",
      endpoint,
      bearerToken,
    };
  });
}
