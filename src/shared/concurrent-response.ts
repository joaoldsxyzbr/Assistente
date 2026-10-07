export interface ConcurrentResponseCoalescer {
  run(key: string, execute: () => Promise<Response>): Promise<Response>;
}

export function createConcurrentResponseCoalescer(
  retentionMs = 2_000,
): ConcurrentResponseCoalescer {
  const entries = new Map<string, {
    expiresAt: number;
    response: Promise<Response>;
  }>();

  return {
    async run(key, execute) {
      const now = Date.now();

      for (const [entryKey, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(entryKey);
      }

      const existing = entries.get(key);
      if (existing !== undefined) {
        return (await existing.response).clone();
      }

      const pending = execute();
      entries.set(key, {
        expiresAt: now + retentionMs,
        response: pending,
      });

      try {
        const response = await pending;
        if (response.status < 300 || response.status >= 400) {
          entries.delete(key);
        }
        return response.clone();
      } catch (error) {
        entries.delete(key);
        throw error;
      }
    },
  };
}


async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function oauthConsentRequestKey(
  request: Request,
): Promise<string | undefined> {
  if (request.method !== "POST") return undefined;

  const url = new URL(request.url);
  if (url.pathname !== "/authorize") return undefined;

  const cookieHeader = request.headers.get("cookie");
  if (
    cookieHeader === null ||
    !cookieHeader.includes("__Host-oauth-consent-")
  ) {
    return undefined;
  }

  const form = await request.clone().formData().catch(() => undefined);
  const handle = form?.get("handle");
  if (typeof handle !== "string" || handle.length === 0) return undefined;

  const hash = await sha256Hex(handle);
  const cookieName = "__Host-oauth-consent-" + hash.slice(0, 16);
  const hasBoundCookie = cookieHeader
    .split(";")
    .some((part) => part.trim().startsWith(cookieName + "="));

  return hasBoundCookie ? cookieName : undefined;
}
