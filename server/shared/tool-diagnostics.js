import { audit } from "./audit.js";
import { classifyRemoteFailure } from "../remote-tools.js";

// Fixed fields only: no provider messages, SQL, paths, tokens or arguments.
const STAGES = new Set(["validation", "oauth", "connection", "upstream", "normalization", "preview"]);
const PROVIDERS = new Set(["github", "cloudflare", "assistente"]);

// Cloudflare's official execute tool may return a successful MCP envelope around
// a failed Cloudflare API response. Inspect only a fixed boolean, never log the body.
export function upstreamReportedFailure(result, provider) {
  if (result?.isError) return true;
  if (provider !== "cloudflare") return false;
  const message=result?.content?.[0]?.text;
  if (typeof message !== "string" || message.length > 64*1024 || !message.trimStart().startsWith("{")) return false;
  try { return JSON.parse(message)?.success === false; } catch { return false; }
}
// A Cloudflare API error must also be an MCP tool error, not a success with
// only a warning in the logs. Do not copy the upstream message into audit.
export function markCloudflareResultError(result) {
  return upstreamReportedFailure(result, "cloudflare")
    ? { ...result, isError: true }
    : result;
}

export function createToolDiagnostics({ tool, provider, write = false, traceId, now = Date.now, log = audit }) {
  const started = now();
  let stage = "validation";
  let finished = false;
  let writeAttempted = false;
  const emit = (outcome, category) => {
    if (finished) return;
    finished = true;
    log(outcome === "error" ? "warn" : "info", "tool_execution", {
      tool, server: PROVIDERS.has(provider) ? provider : "assistente",
      traceId, write: Boolean(write), stage,
      durationMs: Math.max(0, now() - started), outcome,
      ...(category ? { category } : {}),
      uncertain: Boolean(write && writeAttempted && outcome === "error")
    });
  };
  return {
    stage(value) { if (!finished && STAGES.has(value)) stage = value; },
    markWriteAttempt() { if (!finished && write) writeAttempted = true; },
    done(result, { preview = false, missingAuth = false } = {}) {
      if (preview) { stage = "preview"; emit("preview"); }
      else if (missingAuth) emit("error", "AUTHORIZATION");
      else if (upstreamReportedFailure(result, provider)) emit("error", "UPSTREAM_ERROR");
      else emit("ok");
      return result;
    },
    fail(error) {
      const category = stage === "validation" ? "VALIDATION" :
        error?.message === "GITHUB_NOT_CONNECTED" ? "AUTHORIZATION" : classifyRemoteFailure(error);
      emit("error", category);
    }
  };
}