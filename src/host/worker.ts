import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { MCP_TOOL_CATALOG } from "../mcps/catalog.ts";
import { withDefaultCloudflareAccount } from "../mcps/cloudflare/tools.ts";
import type { McpToolContract } from "../mcps/contracts.ts";
import type { McpServerId } from "./contracts.ts";
import {
  readMcpConfigurations,
  type Environment,
  type McpServerConfiguration,
} from "./config.ts";
import { RemoteMcpClient } from "./remote-client.ts";
import { createOAuthMcpWorker } from "../shared/oauth-mcp-worker.ts";
import { oauthSecuritySchemesForTool } from "../shared/oauth-helpers.ts";

export interface AssistenteWorkerEnvironment extends Environment {
  ASSISTENTE_OAUTH_PASSWORD?: string;
  MCP_CLOUDFLARE_ACCOUNT_ID?: string;
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
  defaultCloudflareAccountId?: string,
) {
  const client = new RemoteMcpClient(configuration);
  let callStarted = false;

  try {
    await client.connect();
    callStarted = true;
    const remoteArgs = configuration.id === "cloudflare"
      ? withDefaultCloudflareAccount(remoteName, args, defaultCloudflareAccountId)
      : args;
    const result = await client.callTool(remoteName, remoteArgs);
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
  const server = new McpServer({ name: "assistente", version: "0.1.0" });

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
      _meta: {
        securitySchemes: oauthSecuritySchemesForTool(false),
      },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(configurationSummary(configurations)) }],
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
          _meta: {
            securitySchemes: oauthSecuritySchemesForTool(definition.isWrite),
          },
        },
        async (args) =>
          callRemoteTool(
            configuration,
            definition.name,
            args,
            definition.isWrite,
            environment.MCP_CLOUDFLARE_ACCOUNT_ID,
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
