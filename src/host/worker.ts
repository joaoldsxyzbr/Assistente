import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { MCP_TOOL_CATALOG } from "../mcps/catalog.ts";
import type { McpToolContract } from "../mcps/contracts.ts";
import type { McpServerId } from "./contracts.ts";
import {
  readMcpConfigurations,
  type Environment,
  type McpServerConfiguration,
} from "./config.ts";
import { RemoteMcpClient } from "./remote-client.ts";
import { createOAuthMcpWorker } from "../shared/oauth-mcp-worker.ts";

export interface AssistenteWorkerEnvironment extends Environment {
  ASSISTENTE_OAUTH_PASSWORD?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
}

function toolManifest(serverId: McpServerId): McpToolContract[] {
  return MCP_TOOL_CATALOG.filter((tool) => tool.serverId === serverId);
}

function toolNameForServer(serverId: McpServerId, remoteName: string): string {
  const safeRemoteName = remoteName.replace(/[^A-Za-z0-9_-]/g, "_");
  if (safeRemoteName.length === 0) {
    throw new Error("Tool name cannot be empty after normalization");
  }
  return `mcp_${serverId}__${safeRemoteName}`;
}

function textContent(result: { content: readonly unknown[] }): Array<{
  type: "text";
  text: string;
}> {
  return result.content.map((item) => {
    if (
      item !== null &&
      typeof item === "object" &&
      "type" in item && item.type === "text" &&
      "text" in item && typeof item.text === "string"
    ) {
      return { type: "text", text: item.text };
    }
    return { type: "text", text: JSON.stringify(item) ?? String(item) };
  });
}

async function callRemoteTool(
  configuration: Extract<McpServerConfiguration, { status: "configured" }>,
  remoteName: string,
  args: Record<string, unknown>,
  isWrite: boolean,
) {
  const client = new RemoteMcpClient(configuration);
  let callStarted = false;

  try {
    await client.connect();
    callStarted = true;
    const result = await client.callTool(remoteName, args);
    return {
      content: textContent(result),
      isError: result.isError ?? false,
    };
  } catch {
    const message = isWrite && callStarted
      ? "O resultado da operação pode ser incerto. Consulte o MCP de origem antes de tentar novamente."
      : "O MCP de origem está indisponível ou rejeitou a chamada.";
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function probeRemoteMcp(
  configuration: Extract<McpServerConfiguration, { status: "configured" }>,
): Promise<"READY" | "AUTH_REJECTED" | "UNREACHABLE" | `HTTP_${number}`> {
  try {
    const response = await fetch(configuration.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.bearerToken}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2026-07-28",
          capabilities: {},
          clientInfo: {
            name: "assistente-diagnostic",
            version: "0.1.0",
          },
        },
      }),
    });

    await response.body?.cancel().catch(() => undefined);

    if (response.ok) return "READY";
    if (response.status === 401 || response.status === 403) return "AUTH_REJECTED";
    return `HTTP_${response.status}`;
  } catch {
    return "UNREACHABLE";
  }
}

async function configurationSummary(
  configurations: readonly McpServerConfiguration[],
) {
  return Promise.all(configurations.map(async (configuration) => {
    const declaredTools = toolManifest(configuration.id).length;
    return {
      id: configuration.id,
      label: configuration.label,
      configuration:
        configuration.status === "configured" && declaredTools === 0
          ? "NO_LOCAL_TOOL_CONTRACT"
          : configuration.status.toUpperCase(),
      declaredToolCount: declaredTools,
      remoteHandshake:
        configuration.status === "configured"
          ? await probeRemoteMcp(configuration)
          : null,
    };
  }));
}

export function createAssistenteMcpServer(
  environment: AssistenteWorkerEnvironment,
): McpServer {
  const configurations = readMcpConfigurations(environment);
  const server = new McpServer({ name: "assistente", version: "0.1.0" });

  server.registerTool(
    "assistente_status",
    {
      description:
        "Mostra quais conexões MCP estão configuradas, quantas ferramentas o Assistente declara e uma categoria segura do handshake remoto. Não revela URLs nem credenciais.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await configurationSummary(configurations)) }],
    }),
  );

  const routes = new Set<string>();

  for (const configuration of configurations) {
    if (configuration.status !== "configured") continue;

    for (const definition of toolManifest(configuration.id)) {
      const qualifiedName = toolNameForServer(configuration.id, definition.name);
      if (routes.has(qualifiedName)) continue;
      routes.add(qualifiedName);

      server.registerTool(
        qualifiedName,
        {
          description: configuration.label + ": " + definition.description,
          inputSchema: fromJsonSchema<Record<string, unknown>>(definition.inputSchema),
        },
        async (args) =>
          callRemoteTool(
            configuration,
            definition.name,
            args,
            definition.isWrite,
          ),
      );
    }
  }

  return server;
}

const writeToolNames = MCP_TOOL_CATALOG
  .filter((tool) => tool.isWrite)
  .map((tool) => toolNameForServer(tool.serverId, tool.name));

export default createOAuthMcpWorker<AssistenteWorkerEnvironment>({
  createServer: (environment) => createAssistenteMcpServer(environment),
  resource: "https://assistente.joaolds.xyz.br/mcp",
  resourceName: "Assistente MCP",
  writeToolNames,
});
