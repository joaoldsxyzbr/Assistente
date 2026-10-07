import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { MCP_TOOL_CATALOG } from "../mcps/catalog.ts";
import type { McpToolContract } from "../mcps/contracts.ts";
import type { McpServerId, McpToolDefinition } from "./contracts.ts";
import { readMcpConfigurations, type Environment, type McpServerConfiguration } from "./config.ts";
import { RemoteMcpClient } from "./remote-client.ts";
import { toolNameForServer } from "./host.ts";
import { createAuthenticatedMcpWorker } from "../shared/authenticated-mcp-worker.ts";

export interface AssistenteWorkerEnvironment extends Environment {
  ASSISTENTE_MCP_TOKEN?: string;
}

function toolManifest(serverId: McpServerId): McpToolContract[] {
  return MCP_TOOL_CATALOG.filter((tool) => tool.serverId === serverId);
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

function configurationSummary(
  configurations: readonly McpServerConfiguration[],
) {
  return configurations.map((configuration) => {
    const declaredTools = toolManifest(configuration.id).length;
    return {
      id: configuration.id,
      label: configuration.label,
      configuration:
        configuration.status === "configured" && declaredTools === 0
          ? "NO_LOCAL_TOOL_CONTRACT"
          : configuration.status.toUpperCase(),
      declaredToolCount: declaredTools,
    };
  });
}

export function createAssistenteMcpServer(
  environment: AssistenteWorkerEnvironment,
): McpServer {
  const configurations = readMcpConfigurations(environment);
  const server = new McpServer({ name: "assistente", version: "0.3.0" });

  server.registerTool(
    "assistente_status",
    {
      description:
        "Mostra quais conexões MCP estão configuradas e quantas ferramentas o Assistente declara. Não revela URLs nem credenciais e não testa disponibilidade remota.",
      inputSchema: fromJsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(configurationSummary(configurations)) }],
    }),
  );

  const routes = new Set<string>();
  for (const configuration of configurations) {
    if (configuration.status !== "configured") continue;
    for (const definition of toolManifest(configuration.id)) {
      const remoteDefinition: McpToolDefinition = {
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
      };
      const qualifiedName = toolNameForServer(configuration.id, remoteDefinition);
      if (routes.has(qualifiedName)) continue;
      routes.add(qualifiedName);
      server.registerTool(
        qualifiedName,
        {
          description: `${configuration.label}: ${definition.description}`,
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

export default createAuthenticatedMcpWorker(
  (environment: AssistenteWorkerEnvironment) => createAssistenteMcpServer(environment),
  (environment: AssistenteWorkerEnvironment) => environment.ASSISTENTE_MCP_TOKEN,
);
