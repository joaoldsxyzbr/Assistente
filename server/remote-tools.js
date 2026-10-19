import { readRemoteConfiguration, withRemoteClient } from "./remote-client.js";
import { audit } from "./shared/audit.js";
import { remoteCallMetrics, remoteCallTimeout, MAX_PUSH_BYTES, MAX_PUSH_FILES } from "./shared/batch-policy.js";

const PROVIDERS = ["github", "cloudflare"];
const MAX_OUTPUT_BYTES = 64 * 1024;
const encoder = new TextEncoder();
export const remoteToolNames = PROVIDERS.map(provider => "mcp_" + provider + "_call");

function fail(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}

// Classificacao fechada: jamais incluir mensagens, argumentos ou tokens de terceiros.
// Um erro de transporte depois da chamada pode significar que a escrita aconteceu.
export function classifyRemoteFailure(error) {
  const detail = String(error?.code ?? "") + " " + String(error?.message ?? "");
  const status = Number(error?.status ?? error?.statusCode);
  if (/UPSTREAM_RESPONSE_TOO_LARGE/.test(detail) || status === 413) return "RESPONSE_TOO_LARGE";
  if (/timeout|timed.out|deadline|aborted/i.test(detail) || status === 408 || status === 504) return "TIMEOUT";
  if (/rate.limit|too.many.requests/i.test(detail) || status === 429) return "RATE_LIMIT";
  if (/unauthorized|invalid.token|expired.token|forbidden|insufficient.scope/i.test(detail) ||
      status === 401 || status === 403) return "AUTHORIZATION";
  if (/invalid.param|invalid.argument|unknown.tool|validation/i.test(detail) ||
      status === 400 || status === 404 || status === 422) return "VALIDATION";
  if (/network|fetch.failed|connection|unavailable|internal.server|\b(?:500|502|503)\b/i.test(detail) ||
      status >= 500 && status < 600) return "UPSTREAM_UNAVAILABLE";
  return "UNCONFIRMED";
}
export function remoteFailure(error, provider) {
  const category = classifyRemoteFailure(error);
  const advice = {
    RESPONSE_TOO_LARGE: "Restrinja ou pagine a consulta.",
    TIMEOUT: "A chamada excedeu o prazo.",
    RATE_LIMIT: "Limite de chamadas atingido. Aguarde antes de consultar novamente.",
    AUTHORIZATION: "Verifique a autorizacao OAuth e as permissoes do provedor.",
    VALIDATION: "Confira o nome da ferramenta e os argumentos exigidos.",
    UPSTREAM_UNAVAILABLE: "O provedor ou a rede nao respondeu corretamente.",
    UNCONFIRMED: "Nao foi possivel confirmar a resposta remota."
  }[category];
  return fail("[" + category + "] " + provider + ": " + advice +
    " Se era uma escrita, verifique o estado no provedor antes de tentar novamente.");
}
function label(value) {
  return typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 160) : "";
}
function externalLink(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    // Never expose pre-signed URLs or credentials in query parameters.
    if (url.search) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
function isTextMime(mime) {
  if (mime === undefined) return true;
  if (typeof mime !== "string") return false;
  const value = mime.toLowerCase().split(";")[0].trim();
  return value.startsWith("text/") ||
    ["application/json", "application/xml", "application/javascript", "application/yaml", "application/x-yaml"].includes(value) ||
    value.endsWith("+json") || value.endsWith("+xml");
}
function cleanStructured(value, depth = 0) {
  if (depth > 24) throw Error("STRUCTURED_DEPTH_EXCEEDED");
  if (Array.isArray(value)) return value.map(item => cleanStructured(item, depth + 1));
  if (value && typeof value === "object") {
    if (["image", "audio", "resource", "resource_link"].includes(value.type)) return "[recurso não textual omitido]";
    const output = {};
    for (const [key, part] of Object.entries(value)) {
      if (key === "_meta") continue;
      if (["base64", "blob", "bytes"].includes(key.toLowerCase())) {
        output[key] = "[dados binários omitidos]";
        continue;
      }
      output[key] = cleanStructured(part, depth + 1);
    }
    return output;
  }
  if (typeof value === "string" && /^data:[^,]+;base64,/i.test(value)) return "[dados binários omitidos]";
  return value;
}

// Only text leaves the Worker. MCP attachments, resources and opaque metadata
// never cross the ChatGPT boundary, even when the upstream emits them.
export function normalizeRemoteResult(response) {
  if (!response || typeof response !== "object" || (response.content !== undefined && !Array.isArray(response.content))) {
    return fail("Resposta remota inválida; nenhum conteúdo encaminhado.");
  }
  const content = [];
  let hasText = false;
  let omitted = false;
  for (const block of response.content ?? []) {
    if (!block || typeof block !== "object") return fail("Bloco MCP inválido; nenhum conteúdo encaminhado.");
    if (block.type === "text" && typeof block.text === "string") {
      content.push({ type: "text", text: block.text });
      hasText = true;
    } else if (block.type === "resource" && block.resource && typeof block.resource.text === "string" && isTextMime(block.resource.mimeType)) {
      const origin = label(block.resource.uri);
      content.push({ type: "text", text: (origin ? "Recurso textual: " + origin + "\n" : "") + block.resource.text });
      hasText = true;
    } else if (block.type === "resource_link") {
      const title = label(block.name || block.title) || "Recurso remoto";
      const url = externalLink(block.uri);
      content.push({ type: "text", text: title + (url ? ": " + url : " (link não encaminhado)") });
      omitted = true;
    } else {
      const kind = label(block.type) || "desconhecido";
      content.push({ type: "text", text: "Conteúdo " + kind + " não textual omitido." });
      omitted = true;
    }
  }
  if (response.structuredContent !== undefined && !hasText) {
    try {
      const json = JSON.stringify(cleanStructured(response.structuredContent));
      if (typeof json !== "string") return fail("Resultado estruturado inválido; nenhum conteúdo encaminhado.");
      content.push({ type: "text", text: json });
    } catch {
      return fail("Resultado estruturado inválido ou profundo demais; nenhum conteúdo encaminhado.");
    }
  }
  if (content.length === 0) {
    content.push({ type: "text", text: "Operação remota concluída sem conteúdo de resposta." });
  }
  if (encoder.encode(content.map(block => block.text).join("\n")).length > MAX_OUTPUT_BYTES) {
    return fail("[RESPONSE_TOO_LARGE] Resposta remota excede 64 KiB. Restrinja ou pagine a consulta. Se era uma escrita, verifique o estado no provedor antes de tentar novamente.");
  }
  return { isError: Boolean(response.isError) || (omitted && !hasText && response.structuredContent === undefined), content };
}

// Keep broad discovery compact; load the input schema only for a focused match.
function searchable(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[_./-]+/g, " ").replace(/\s+/g, " ").trim();
}
export function selectRemoteTools(tools, { query = "", name, limit = 20, cursor = 0 } = {}) {
  if (!Array.isArray(tools)) throw Error("INVALID_TOOL_CATALOG");
  if (name !== undefined) {
    const tool = tools.find(item => item?.name === name);
    return tool ? { tool } : { error: "Ferramenta não encontrada no catálogo oficial." };
  }
  const needle = searchable(query);
  const terms = needle ? needle.split(" ") : [];
  const candidates = tools.map((tool, index) => {
    const toolName = searchable(tool?.name);
    const description = searchable(tool?.description);
    if (!toolName) return null;
    const score = !terms.length ? 0
      : (toolName === needle ? 1000 : toolName.startsWith(needle) ? 100 : 0)
        + terms.reduce((sum, term) => sum + (toolName.includes(term) ? 10 : 1), 0);
    return { tool, index, toolName, description, score };
  }).filter(Boolean);
  // Prefer tools whose names match every search term; use descriptions only
  // when no name matches. This keeps "get file" focused on get_file_contents.
  const nameMatches = terms.length
    ? candidates.filter(item => terms.every(term => item.toolName.includes(term))) : [];
  const matches = nameMatches.length ? nameMatches
    : candidates.filter(item => terms.every(term =>
      item.toolName.includes(term) || item.description.includes(term)));
  if (terms.length) matches.sort((a, b) => b.score - a.score || a.index - b.index);
  const selection = matches.slice(cursor, cursor + limit).map(({ tool }) => ({
    name: tool.name,
    description: typeof tool.description === "string" ? tool.description.slice(0, 180) : ""
  }));

  // A single precise search can go straight to mcp_*_call without an extra
  // round trip for "name". Large schemas still require explicit detail lookup.
  if (terms.length && matches.length === 1 && selection.length === 1) {
    const schema = matches[0].tool.inputSchema;
    if (schema && typeof schema === "object" &&
        encoder.encode(JSON.stringify(schema)).length <= 16 * 1024) {
      selection[0].inputSchema = schema;
    }
  }
  return {
    total: matches.length, cursor,
    nextCursor: cursor + limit < matches.length ? cursor + limit : null,
    tools: selection
  };
}

// A direct call avoids fetching the whole catalog again before every operation.
// Unknown tools and invalid arguments are handled by the official MCP server.
export function invokeRemoteTool(client, name, args, timeoutMs = 45000) {
  return client.callTool({ name, arguments: args }, { timeout: timeoutMs });
}

export function registerRemoteTools(server, env, fromJsonSchema, securitySchemes, traceId) {
  for (const provider of PROVIDERS) {
    server.registerTool("mcp_" + provider + "_tools", {
      description: "Pesquisa as ferramentas do MCP oficial " + provider + " por palavras (query). Lista resumos ordenados por relevância; resultado único inclui inputSchema quando compacto. Use name para o schema completo.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          query: { type: "string", maxLength: 128 },
          name: { type: "string", minLength: 1, maxLength: 128 },
          cursor: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        additionalProperties: false
      }),
      _meta: { securitySchemes: securitySchemes(false) }
    }, async (options = {}) => {
      const started = Date.now();
      try {
        const config = await readRemoteConfiguration(env, provider);
        if (!config) return fail("[AUTHORIZATION] OAuth upstream indisponivel para " + provider + ". Consulte assistente_status.");
        const value = await withRemoteClient(config, client => client.listTools(undefined, { timeout: 15000 }));
        const selected = selectRemoteTools(value.tools, options);
        if (selected.error) return fail(selected.error);
        const result = normalizeRemoteResult({ content: [{ type: "text", text: JSON.stringify(selected) }] });
        audit(result.isError ? "warn" : "info", "remote_discovery", {
          server: provider, outcome: result.isError ? "error" : "ok", traceId, durationMs: Date.now() - started
        });
        return result;
      } catch (error) {
        const category = classifyRemoteFailure(error);
        audit("warn", "remote_discovery", { server: provider, outcome: "error", category, traceId, durationMs: Date.now() - started });
        return remoteFailure(error, provider);
      }
    });
    server.registerTool("mcp_" + provider + "_call", {
      description: "Encaminha uma chamada ao MCP oficial " + provider + ". No GitHub, push_files aceita ate 8 arquivos/128 KiB por commit; lotes maiores devem ser divididos antes da chamada. Nunca repita escrita incerta. Exige mcp:write.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 128 },
          arguments: { type: "object", additionalProperties: true }
        },
        required: ["name", "arguments"],
        additionalProperties: false
      }),
      _meta: { securitySchemes: securitySchemes(true) }
    }, async ({ name, arguments: args }) => {
      const started = Date.now();
      const metrics = remoteCallMetrics(provider, name, args);
      const details = { inputBytes: metrics.inputBytes, fileCount: metrics.fileCount, batch: metrics.batch };
      if (metrics.tooLarge) {
        audit("warn", "remote_call", {
          server: provider, outcome: "rejected", category: "BATCH_TOO_LARGE",
          traceId, durationMs: Date.now() - started, ...details
        });
        return fail("[BATCH_TOO_LARGE] Lote GitHub acima do limite seguro: " +
          MAX_PUSH_FILES + " arquivos e " + (MAX_PUSH_BYTES / 1024) + " KiB por chamada. " +
          "Divida em commits menores, confirme cada commit no GitHub e nao repita escritas incertas.");
      }
      const timeoutMs = remoteCallTimeout(provider, name);
      try {
        const config = await readRemoteConfiguration(env, provider);
        if (!config) return fail("[AUTHORIZATION] OAuth upstream indisponivel para " + provider + ". Consulte assistente_status.");
        const result = await withRemoteClient(config, async client => {
          // Nunca repetir automaticamente uma chamada generica; ela pode modificar dados.
          return normalizeRemoteResult(await invokeRemoteTool(client, name, args, timeoutMs));
        }, { callTimeoutMs: timeoutMs });
        audit(result.isError ? "warn" : "info", "remote_call", {
          server: provider, outcome: result.isError ? "error" : "ok",
          category: result.isError ? "upstream_result" : undefined,
          traceId, durationMs: Date.now() - started, ...details
        });
        return result;
      } catch (error) {
        const category = classifyRemoteFailure(error);
        audit("warn", "remote_call", {
          server: provider, outcome: "uncertain", uncertain: true,
          category, traceId, durationMs: Date.now() - started, ...details
        });
        return remoteFailure(error, provider);
      }
    });
  }
}