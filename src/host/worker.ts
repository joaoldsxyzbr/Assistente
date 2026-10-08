import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { MCP_TOOL_CATALOG } from "../mcps/catalog.ts";
import { withDefaultCloudflareAccount } from "../mcps/cloudflare/tools.ts";
import type { McpToolContract } from "../mcps/contracts.ts";
import {
  buildPontoHojeCode,
  buildPontoRegistrarCode,
  buildPontoResumoCode,
  currentPontoLocalDate,
  normalizePontoHorario,
  PONTO_TOOL_CATALOG,
} from "../mcps/ponto/tools.ts";
import {
  buildGastosCode, GASTOS_TOOL_CATALOG, prepareGastosAction,
} from "../mcps/gastos/tools.ts";
import type { McpServerId } from "./contracts.ts";
import {
  readMcpConfigurations,
  type Environment,
  type McpServerConfiguration,
} from "./config.ts";
import { RemoteMcpClient } from "./remote-client.ts";
import { classifyRemoteCallFailure } from "./remote-failure.ts";
import { createOAuthMcpWorker } from "../shared/oauth-mcp-worker.ts";
import { oauthSecuritySchemesForTool } from "../shared/oauth-helpers.ts";
import { audit } from "../shared/audit.ts";

export interface AssistenteWorkerEnvironment extends Environment {
  ASSISTENTE_OAUTH_PASSWORD?: string;
  MCP_CLOUDFLARE_ACCOUNT_ID?: string;
  PONTO_D1_DATABASE_ID?: string;
  GASTOS_D1_DATABASE_ID?: string;
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
    const isError = result.isError ?? false;
    audit(isError ? "warn" : "info", "upstream_tool_call", {
      server: configuration.id,
      tool: remoteName,
      write: isWrite,
      outcome: isError ? "remote_error" : "success",
    });
    return {
      content: textContent(result),
      isError,
    };
  } catch (error) {
    const failure = classifyRemoteCallFailure(error, isWrite, callStarted);
    audit("warn", "upstream_tool_call", {
      server: configuration.id,
      tool: remoteName,
      write: isWrite,
      outcome: failure.outcome,
      uncertain: failure.uncertain,
    });
    return { isError: true, content: [{ type: "text" as const, text: failure.message }] };
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

function pontoConfigurationError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
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

  const cloudflareConfiguration = configurations.find(
    (configuration) =>
      configuration.id === "cloudflare" && configuration.status === "configured",
  );
  const pontoDatabaseId = environment.PONTO_D1_DATABASE_ID?.trim() ?? "";

  for (const definition of PONTO_TOOL_CATALOG) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(definition.inputSchema),
        _meta: {
          securitySchemes: oauthSecuritySchemesForTool(definition.isWrite),
        },
      },
      async (args) => {
        if (
          cloudflareConfiguration === undefined ||
          cloudflareConfiguration.status !== "configured"
        ) {
          return pontoConfigurationError(
            "O Cloudflare MCP necessário para o controle de ponto não está configurado.",
          );
        }
        if (pontoDatabaseId.length === 0) {
          return pontoConfigurationError(
            "O banco de ponto não está configurado no Assistente MCP.",
          );
        }

        if (definition.name === "ponto_registrar") {
          const horario = normalizePontoHorario(args.horario);
          if (horario === undefined) {
            return pontoConfigurationError("Horário inválido. Use HHMM ou HH:MM.");
          }

          const local = currentPontoLocalDate();
          if (local.weekday === "Sun") {
            return pontoConfigurationError(
              `Domingo (${local.data}) não tem jornada padrão configurada.`,
            );
          }

          return callRemoteTool(
            cloudflareConfiguration,
            "execute",
            {
              code: buildPontoRegistrarCode(
                pontoDatabaseId,
                local.data,
                horario,
                local.weekday === "Sat",
              ),
            },
            true,
            environment.MCP_CLOUDFLARE_ACCOUNT_ID,
          );
        }

        if (definition.name === "ponto_hoje") {
          const local = currentPontoLocalDate();
          return callRemoteTool(
            cloudflareConfiguration,
            "execute",
            { code: buildPontoHojeCode(pontoDatabaseId, local.data) },
            false,
            environment.MCP_CLOUDFLARE_ACCOUNT_ID,
          );
        }

        return callRemoteTool(
          cloudflareConfiguration,
          "execute",
          { code: buildPontoResumoCode(pontoDatabaseId) },
          false,
          environment.MCP_CLOUDFLARE_ACCOUNT_ID,
        );
      },
    );
  }


  const gastosDatabaseId = environment.GASTOS_D1_DATABASE_ID?.trim() ?? "";
  for (const definition of GASTOS_TOOL_CATALOG) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(definition.inputSchema),
        _meta: { securitySchemes: oauthSecuritySchemesForTool(definition.isWrite) },
      },
      async (args) => {
        if (!cloudflareConfiguration || cloudflareConfiguration.status !== "configured") {
          return pontoConfigurationError("Cloudflare MCP não configurado para gastos.");
        }
        if (!gastosDatabaseId) {
          return pontoConfigurationError("Banco D1 de gastos não configurado.");
        }
        const prepared = prepareGastosAction(definition.name, args);
        if ("error" in prepared) return pontoConfigurationError(prepared.error);
        return callRemoteTool(
          cloudflareConfiguration,
          "execute",
          { code: buildGastosCode(gastosDatabaseId, prepared.action) },
          definition.isWrite,
          environment.MCP_CLOUDFLARE_ACCOUNT_ID,
        );
      },
    );
  }

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

const writeToolNames = [
  ...MCP_TOOL_CATALOG
    .filter((tool) => tool.isWrite)
    .map((tool) => toolNameForServer(tool.serverId, tool.name)),
  ...PONTO_TOOL_CATALOG
    .filter((tool) => tool.isWrite)
    .map((tool) => tool.name),
  ...GASTOS_TOOL_CATALOG
    .filter((tool) => tool.isWrite)
    .map((tool) => tool.name),
];

export default createOAuthMcpWorker<AssistenteWorkerEnvironment>({
  createServer: (environment) => createAssistenteMcpServer(environment),
  resource: "https://assistente.joaolds.xyz.br/mcp",
  resourceName: "Assistente MCP",
  writeToolNames,
});
