import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { MCP_TOOL_CATALOG } from "../mcps/catalog.ts";
import type { McpToolContract } from "../mcps/contracts.ts";
import type { McpServerId, McpToolDefinition } from "./contracts.ts";
import {
  readMcpConfigurations,
  type Environment,
  type McpServerConfiguration,
} from "./config.ts";
import { RemoteMcpClient } from "./remote-client.ts";
import { toolNameForServer } from "./host.ts";
import { createOAuthMcpWorker } from "../shared/oauth-mcp-worker.ts";
import { createConcurrentResponseCoalescer } from "../shared/concurrent-response.ts";

export interface AssistenteWorkerEnvironment extends Environment {
  ASSISTENTE_OAUTH_PASSWORD?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
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
  const server = new McpServer({ name: "assistente", version: "0.4.0" });

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
  .map((tool) => toolNameForServer(tool.serverId, tool));

const oauthWorker = createOAuthMcpWorker<AssistenteWorkerEnvironment>({
  createServer: (environment) => createAssistenteMcpServer(environment),
  resource: "https://assistente.joaolds.xyz.br/mcp",
  resourceName: "Assistente MCP",
  writeToolNames,
});

const consentResponses = createConcurrentResponseCoalescer();

export function consentRequestKey(request: Request): string | undefined {
  if (request.method !== "POST") return undefined;
  const url = new URL(request.url);
  if (url.pathname !== "/authorize") return undefined;

  const cookie = request.headers.get("cookie");
  if (cookie === null) return undefined;

  for (const part of cookie.split(";")) {
    const name = part.trim().split("=", 1)[0];
    if (name.startsWith("__Host-oauth-consent-")) {
      return name;
    }
  }
  return undefined;
}

export default {
  async fetch(
    request: Request,
    environment: AssistenteWorkerEnvironment,
    context: Parameters<typeof oauthWorker.fetch>[2],
  ): Promise<Response> {
    const key = consentRequestKey(request);
    if (key === undefined) {
      return oauthWorker.fetch(request, environment, context);
    }

    return consentResponses.run(
      key,
      () => oauthWorker.fetch(request, environment, context),
    );
  },
};
