import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { MCP_TOOL_CATALOG } from "../mcps/catalog.js";
import { withDefaultCloudflareAccount } from "../mcps/cloudflare/tools.js";
import { CLOUDFLARE_READ_TOOL_CATALOG, buildCloudflareReadCode, validCloudflareId } from "../mcps/cloudflare/operations.js";
import {
  buildPontoHojeCode,
  buildPontoPeriodoCode,
  normalizePontoData,
  buildPontoRegistrarCode,
  buildPontoResumoCode,
  currentPontoLocalDate,
  normalizePontoHorario,
  PONTO_TOOL_CATALOG
} from "../mcps/ponto/tools.js";
import {
  buildGastosCode,
  GASTOS_TOOL_CATALOG,
  prepareGastosAction
} from "../mcps/gastos/tools.js";
import {
  readMcpConfigurations
} from "./config.js";
import { RemoteMcpClient } from "./remote-client.js";
import { classifyRemoteCallFailure } from "./remote-failure.js";
import { createOAuthMcpWorker } from "./shared/oauth-mcp-worker.js";
import { oauthSecuritySchemesForTool } from "./shared/oauth-helpers.js";
import { audit } from "./shared/audit.js";
import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";
function toolManifest(serverId) {
  return MCP_TOOL_CATALOG.filter((tool) => tool.serverId === serverId);
}
function toolNameForServer(serverId, remoteName) {
  const safeRemoteName = remoteName.replace(/[^A-Za-z0-9_-]/g, "_");
  if (safeRemoteName.length === 0) {
    throw new Error("Tool name cannot be empty after normalization");
  }
  return `mcp_${serverId}__${safeRemoteName}`;
}
function textContent(result) {
  return result.content.map((item) => {
    if (item !== null && typeof item === "object" && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string") {
      return { type: "text", text: item.text };
    }
    return { type: "text", text: JSON.stringify(item) ?? String(item) };
  });
}
async function callRemoteTool(configuration, remoteName, args, isWrite, defaultCloudflareAccountId) {
  const client = new RemoteMcpClient(configuration);
  let callStarted = false;
  try {
    await client.connect();
    callStarted = true;
    const remoteArgs = configuration.id === "cloudflare" ? withDefaultCloudflareAccount(remoteName, args, defaultCloudflareAccountId) : args;
    const result = await client.callTool(remoteName, remoteArgs);
    const isError = result.isError ?? false;
    audit(isError ? "warn" : "info", "upstream_tool_call", {
      server: configuration.id,
      tool: remoteName,
      write: isWrite,
      outcome: isError ? "remote_error" : "success"
    });
    return {
      content: isError ? [{ type: "text", text: isWrite
        ? "O serviço de origem retornou erro após iniciar uma escrita. Consulte o registro antes de tentar novamente."
        : "O MCP de origem rejeitou a consulta. Confira as permissões ou tente novamente." }] : textContent(result),
      isError
    };
  } catch (error) {
    const failure = classifyRemoteCallFailure(error, isWrite, callStarted);
    audit("warn", "upstream_tool_call", {
      server: configuration.id,
      tool: remoteName,
      write: isWrite,
      outcome: failure.outcome,
      uncertain: failure.uncertain
    });
    return { isError: true, content: [{ type: "text", text: failure.message }] };
  } finally {
    await client.close().catch(() => void 0);
  }
}
function configurationSummary(configurations) {
  return configurations.map((configuration) => {
    const declaredTools = toolManifest(configuration.id).length;
    return {
      id: configuration.id,
      label: configuration.label,
      configuration: configuration.status === "configured" && declaredTools === 0 ? "NO_LOCAL_TOOL_CONTRACT" : configuration.status.toUpperCase(),
      declaredToolCount: declaredTools
    };
  });
}
function pontoConfigurationError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}
function createAssistenteMcpServer(environment) {
  const configurations = readMcpConfigurations(environment);
  const server = new McpServer({ name: "assistente", version: "0.1.0" }, { instructions: MCP_SERVER_INSTRUCTIONS });
  server.registerTool(
    "assistente_status",
    {
      description: "Mostra quais conex\xF5es MCP est\xE3o configuradas e quantas ferramentas o Assistente declara. N\xE3o revela URLs nem credenciais e n\xE3o testa disponibilidade remota.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {},
        additionalProperties: false
      }),
      _meta: {
        securitySchemes: oauthSecuritySchemesForTool(false)
      }
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(configurationSummary(configurations)) }]
    })
  );
  server.registerTool(
    "assistente_skill",
    {
      description: "Consulta instrucoes especializadas de ponto, gastos ou desenvolvimento, sem modificar dados. Use sob demanda.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { nome: { type: "string", enum: SKILL_NAMES, description: "Nome da skill." } },
        required: ["nome"],
        additionalProperties: false
      }),
      _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
    },
    async ({ nome }) => ({ content: [{ type: "text", text: SKILL_CONTENTS[nome] ?? "Skill nao encontrada." }] })
  );
  const cloudflareConfiguration = configurations.find(
    (configuration) => configuration.id === "cloudflare" && configuration.status === "configured"
  );
  for (const definition of CLOUDFLARE_READ_TOOL_CATALOG) {
    server.registerTool(definition.name, {
      description: definition.description,
      inputSchema: fromJsonSchema(definition.inputSchema),
      _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
    }, async (args) => {
      if (!cloudflareConfiguration) return pontoConfigurationError("Cloudflare MCP não configurado.");
      const accountId = environment.MCP_CLOUDFLARE_ACCOUNT_ID?.trim();
      if (!accountId || !/^[0-9a-f]{32}$/i.test(accountId)) return pontoConfigurationError("Conta Cloudflare não configurada corretamente.");
      const code = buildCloudflareReadCode(definition.name, args, {
        ponto: environment.PONTO_D1_DATABASE_ID?.trim(),
        gastos: environment.GASTOS_D1_DATABASE_ID?.trim()
      });
      if (!code) return pontoConfigurationError("Parâmetros ou banco D1 inválidos.");
      return callRemoteTool(cloudflareConfiguration, "execute", { code, account_id: accountId }, false, accountId);
    });
  }
  const pontoDatabaseId = environment.PONTO_D1_DATABASE_ID?.trim() ?? "";
  for (const definition of PONTO_TOOL_CATALOG) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: fromJsonSchema(definition.inputSchema),
        _meta: {
          securitySchemes: oauthSecuritySchemesForTool(definition.isWrite)
        }
      },
      async (args) => {
        if (cloudflareConfiguration === void 0 || cloudflareConfiguration.status !== "configured") {
          return pontoConfigurationError(
            "O Cloudflare MCP necess\xE1rio para o controle de ponto n\xE3o est\xE1 configurado."
          );
        }
        if (!validCloudflareId(pontoDatabaseId) || pontoDatabaseId === environment.GASTOS_D1_DATABASE_ID?.trim()) {
          return pontoConfigurationError(
            "O banco de ponto n\xE3o est\xE1 configurado no Assistente MCP."
          );
        }
        if (definition.name === "ponto_registrar") {
          const horario = normalizePontoHorario(args.horario);
          if (horario === void 0) {
            return pontoConfigurationError("Hor\xE1rio inv\xE1lido. Use HHMM ou HH:MM.");
          }
          const local = currentPontoLocalDate();
          if (local.weekday === "Sun") {
            return pontoConfigurationError(
              `Domingo (${local.data}) n\xE3o tem jornada padr\xE3o configurada.`
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
                local.weekday === "Sat"
              )
            },
            true,
            environment.MCP_CLOUDFLARE_ACCOUNT_ID
          );
        }
        if (definition.name === "ponto_data") {
          const data = normalizePontoData(args.data);
          if (!data) return pontoConfigurationError("Data inválida. Use DD/MM/AAAA.");
          return callRemoteTool(
            cloudflareConfiguration, "execute",
            { code: buildPontoHojeCode(pontoDatabaseId, data.data) },
            false, environment.MCP_CLOUDFLARE_ACCOUNT_ID
          );
        }
        if (definition.name === "ponto_periodo") {
          const inicio = normalizePontoData(args.inicio);
          const fim = normalizePontoData(args.fim);
          if (!inicio || !fim || inicio.iso > fim.iso) {
            return pontoConfigurationError("Período inválido. Use DD/MM/AAAA com início anterior ou igual ao fim.");
          }
          const elapsedDays = (Date.parse(fim.iso + "T00:00:00Z") - Date.parse(inicio.iso + "T00:00:00Z")) / 86400000;
          if (elapsedDays > 92) return pontoConfigurationError("O período máximo é de 93 dias.");
          return callRemoteTool(
            cloudflareConfiguration, "execute",
            { code: buildPontoPeriodoCode(pontoDatabaseId, inicio.iso, fim.iso) },
            false, environment.MCP_CLOUDFLARE_ACCOUNT_ID
          );
        }
        if (definition.name === "ponto_hoje") {
          const local = currentPontoLocalDate();
          return callRemoteTool(
            cloudflareConfiguration,
            "execute",
            { code: buildPontoHojeCode(pontoDatabaseId, local.data) },
            false,
            environment.MCP_CLOUDFLARE_ACCOUNT_ID
          );
        }
        return callRemoteTool(
          cloudflareConfiguration,
          "execute",
          { code: buildPontoResumoCode(pontoDatabaseId) },
          false,
          environment.MCP_CLOUDFLARE_ACCOUNT_ID
        );
      }
    );
  }
  const gastosDatabaseId = environment.GASTOS_D1_DATABASE_ID?.trim() ?? "";
  for (const definition of GASTOS_TOOL_CATALOG) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: fromJsonSchema(definition.inputSchema),
        _meta: { securitySchemes: oauthSecuritySchemesForTool(definition.isWrite) }
      },
      async (args) => {
        if (!cloudflareConfiguration || cloudflareConfiguration.status !== "configured") {
          return pontoConfigurationError("Cloudflare MCP n\xE3o configurado para gastos.");
        }
        if (!validCloudflareId(gastosDatabaseId) || gastosDatabaseId === pontoDatabaseId) {
          return pontoConfigurationError("Banco D1 de gastos n\xE3o configurado.");
        }
        const prepared = prepareGastosAction(definition.name, args);
        if ("error" in prepared) return pontoConfigurationError(prepared.error);
        return callRemoteTool(
          cloudflareConfiguration,
          "execute",
          { code: buildGastosCode(gastosDatabaseId, prepared.action) },
          definition.isWrite,
          environment.MCP_CLOUDFLARE_ACCOUNT_ID
        );
      }
    );
  }
  const githubConfiguration = configurations.find(c => c.id === "github" && c.status === "configured");
  server.registerTool("github_ci_resumo", {
    description: "Mostra o estado das últimas execuções do GitHub Actions, sem disparar ou alterar workflows.",
    inputSchema: fromJsonSchema({
      type: "object",
      properties: {
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
        branch: { type: "string", description: "Branch opcional para filtrar o resumo." }
      },
      required: ["owner", "repo"],
      additionalProperties: false
    }),
    _meta: { securitySchemes: oauthSecuritySchemesForTool(false) }
  }, async ({ owner, repo, branch }) => {
    if (!githubConfiguration) return pontoConfigurationError("GitHub MCP não configurado.");
    if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) ||
        (branch !== undefined && (!branch || branch.length > 150 || !/^[A-Za-z0-9_.\/-]+$/.test(branch)))) {
      return pontoConfigurationError("Repositório ou branch inválidos.");
    }
    const response = await callRemoteTool(githubConfiguration, "actions_list", {
      owner, repo, method: "list_workflow_runs", perPage: 30
    }, false);
    if (response.isError) return response;
    try {
      const content = response.content.find(c => c.type === "text")?.text;
      const parsed = JSON.parse(content);
      const runs = Array.isArray(parsed.workflow_runs) ? parsed.workflow_runs : [];
      const selected = runs.filter(r => !branch || r.head_branch === branch).slice(0, 5);
      return { content: [{ type: "text", text: JSON.stringify({
        repository: owner + "/" + repo, branch: branch ?? null,
        execucoes: selected.map(r => ({
          id: r.id, name: r.name, branch: r.head_branch, sha: r.head_sha,
          status: r.status, conclusion: r.conclusion ?? null, url: r.html_url, created_at: r.created_at
        }))
      }) }] };
    } catch {
      return pontoConfigurationError("Não foi possível interpretar o resumo do CI.");
    }
  });
  const routes = /* @__PURE__ */ new Set();
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
          inputSchema: fromJsonSchema(definition.inputSchema),
          _meta: {
            securitySchemes: oauthSecuritySchemesForTool(definition.isWrite)
          }
        },
        async (args) => callRemoteTool(
          configuration,
          definition.name,
          args,
          definition.isWrite,
          environment.MCP_CLOUDFLARE_ACCOUNT_ID
        )
      );
    }
  }
  return server;
}
const writeToolNames = [
  ...MCP_TOOL_CATALOG.filter((tool) => tool.isWrite).map((tool) => toolNameForServer(tool.serverId, tool.name)),
  ...PONTO_TOOL_CATALOG.filter((tool) => tool.isWrite).map((tool) => tool.name),
  ...GASTOS_TOOL_CATALOG.filter((tool) => tool.isWrite).map((tool) => tool.name)
];
const oauthWorker = createOAuthMcpWorker({
  createServer: (environment) => createAssistenteMcpServer(environment),
  resource: "https://assistente.joaolds.xyz.br/mcp",
  resourceName: "Assistente MCP",
  writeToolNames
});
var worker_default = {
  fetch(request, environment, context) {
    return oauthWorker.fetch(request, environment, context);
  }
};
export {
  createAssistenteMcpServer,
  worker_default as default
};
