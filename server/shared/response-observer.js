import { audit } from "./audit.js";

// Observa o fim da leitura do corpo HTTP, sem ler ou guardar o seu conteudo.
// "finished" significa que o stream foi consumido pelo runtime, nao que o ChatGPT o interpretou.
export function observeMcpResponse(response, { traceId, write = false, startedAt = Date.now(), log = audit }) {
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const transport = type === "text/event-stream" ? "sse" : type === "application/json" ? "json" : "other";
  const headers = new Headers(response.headers);
  if (traceId) headers.set("x-assistente-trace-id", traceId);
  const status = response.status;
  let bytes = 0;
  let ended = false;
  function complete(phase) {
    if (ended) return;
    ended = true;
    log(phase === "finished" ? "info" : "warn", "mcp_response_stream", {
      status, traceId, write, transport, phase, bytes, durationMs: Date.now() - startedAt
    });
  }
  if (!response.body) {
    complete("finished");
    return new Response(null, { status, statusText: response.statusText, headers });
  }
  const reader = response.body.getReader();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          complete("finished");
          controller.close();
          return;
        }
        bytes += value.byteLength;
        controller.enqueue(value);
      } catch {
        complete("errored");
        controller.error(new Error("MCP_RESPONSE_STREAM_ERROR"));
      }
    },
    async cancel(reason) {
      complete("cancelled");
      try { await reader.cancel(reason); } catch { /* stream already closed */ }
    }
  });
  return new Response(stream, { status, statusText: response.statusText, headers });
}
