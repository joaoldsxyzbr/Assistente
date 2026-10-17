// Bound remote payloads *while streaming*, before OAuth JSON or MCP SSE parsing.
export const MAX_UPSTREAM_BODY_BYTES = 2 * 1024 * 1024;

export function limitUpstreamResponse(response, maxBytes = MAX_UPSTREAM_BODY_BYTES) {
  const declared = Number(response.headers.get("content-length"));
  if (response.headers.has("content-length") && Number.isFinite(declared) && declared > maxBytes) {
    response.body?.cancel().catch(() => {});
    throw Error("UPSTREAM_RESPONSE_TOO_LARGE");
  }
  if (!response.body) return response;
  let bytes = 0;
  const stream = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw Error("UPSTREAM_RESPONSE_TOO_LARGE");
      controller.enqueue(chunk);
    }
  }));
  return new Response(stream, response);
}

// Workers supports manual redirects. Never forward credentials to a redirect target.
export async function fetchUpstream(fetchFn, url, init = {}, timeoutMs = 15000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchFn(url, { ...init, redirect: "manual", signal });
  } catch (error) {
    if (timeout.aborted) throw Error("UPSTREAM_REQUEST_TIMEOUT");
    throw error;
  }
  if (response.status >= 300 && response.status < 400) throw Error("UPSTREAM_REDIRECT_REJECTED");
  return limitUpstreamResponse(response);
}
