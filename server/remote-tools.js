import { readRemoteConfiguration, withRemoteClient } from "./remote-client.js";
import { audit } from "./shared/audit.js";

const PROVIDERS = ["github", "cloudflare"];
const MAX_OUTPUT_BYTES = 64 * 1024;
const encoder = new TextEncoder();
export const remoteToolNames = PROVIDERS.map(provider => "mcp_" + provider + "_call");

function fail(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
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
    return fail("Resposta remota excede 64 KiB. Nenhum trecho foi enviado como resultado completo; faça consulta mais específica ou paginada.");
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
  const matches = tools.map((tool, index) => {
    const toolName = searchable(tool?.name);
    const description = searchable(tool?.description);
    if (!toolName || !terms.every(term => toolName.includes(term) || description.includes(term))) return null;
    const score = !terms.length ? 0
      : (toolName === needle ? 1000 : toolName.startsWith(needle) ? 100 : 0)
        + terms.reduce((sum, term) => sum + (toolName.includes(term) ? 10 : 1), 0);
    return { tool, index, score };
  }).filter(Boolean);
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

export function registerRemoteTools(server, env, fromJsonSchema, securitySchemes) {
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
      const config = await readRemoteConfiguration(env, provider);
      if (!config) return fail("OAuth upstream não conectado para " + provider + ". Consulte assistente_status.");
      const started = Date.now();
      try {
        const value = await withRemoteClient(config, client => client.listTools(undefined, { timeout: 15000 }));
        const selected = selectRemoteTools(value.tools, options);
        audit("info", "remote_discovery", { server: provider, outcome: "ok", durationMs: Date.now() - started });
        if (selected.error) return fail(selected.error);
        return normalizeRemoteResult({ content: [{ type: "text", text: JSON.stringify(selected) }] });
      } catch {
        audit("warn", "remote_discovery", { server: provider, outcome: "error", durationMs: Date.now() - started });
        return fail("Não foi possível consultar o MCP oficial " + provider + ". Verifique a conexão OAuth.");
      }
    });
    server.registerTool("mcp_" + provider + "_call", {
      description: "Encaminha uma chamada ao MCP oficial " + provider + " com resposta somente textual, sem anexos. Exige escopo mcp:write por segurança.",
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
      const config = await readRemoteConfiguration(env, provider);
      if (!config) return fail("OAuth upstream não conectado para " + provider + ". Consulte assistente_status.");
      const started = Date.now();
      try {
        const result = await withRemoteClient(config, async client => {
          const tools = (await client.listTools(undefined, { timeout: 15000 })).tools;
          if (!tools.some(tool => tool.name === name)) return fail("A ferramenta não foi publicada pelo MCP oficial.");
          return normalizeRemoteResult(await client.callTool({ name, arguments: args }, { timeout: 45000 }));
        });
        audit(result.isError ? "warn" : "info", "remote_call", {
          server: provider, outcome: result.isError ? "error" : "ok", durationMs: Date.now() - started
        });
        return result;
      } catch {
        audit("warn", "remote_call", { server: provider, outcome: "uncertain", uncertain: true, durationMs: Date.now() - started });
        return fail("A chamada remota não foi confirmada. Se era escrita, consulte o provedor antes de repetir.");
      }
    });
  }
}
