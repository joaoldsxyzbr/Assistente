import { audit } from "./audit.js";

// Native Cloudflare rate limiting (per location), never keyed by a bearer token.
export async function enforceRateLimit(binding, key, event) {
  if (!binding) return null; // Allows isolated unit tests without deployed bindings.
  try {
    const result = await binding.limit({ key });
    if (result.success) return null;
    audit("warn", event, { status: 429, outcome: "limited" });
    return new Response("Muitas tentativas. Tente novamente em instantes.", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" }
    });
  } catch {
    audit("warn", event, { status: 503, outcome: "rate_limit_unavailable" });
    return new Response("Proteção temporariamente indisponível.", { status: 503 });
  }
}

