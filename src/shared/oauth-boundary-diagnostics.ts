export interface OAuthDiagnosticStore {
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

export type OAuthBoundaryStage =
  | "authorize_get_response"
  | "authorize_post_response"
  | "authorize_handler_exception"
  | "token_request_seen"
  | "token_response"
  | "token_handler_exception";

const DIAGNOSTIC_TTL_SECONDS = 60 * 60;
const DIAGNOSTIC_PREFIX = "diagnostic:oauth:";

export async function recordOAuthBoundary(
  store: OAuthDiagnosticStore | undefined,
  stage: OAuthBoundaryStage,
  status?: number,
  code?: string,
): Promise<void> {
  if (store === undefined) return;

  const record: {
    stage: OAuthBoundaryStage;
    observedAt: string;
    status?: number;
    code?: string;
  } = {
    stage,
    observedAt: new Date().toISOString(),
  };

  if (status !== undefined) record.status = status;
  if (code !== undefined) record.code = code;

  try {
    await store.put(
      DIAGNOSTIC_PREFIX + stage,
      JSON.stringify(record),
      { expirationTtl: DIAGNOSTIC_TTL_SECONDS },
    );
  } catch {
    // Diagnostics are best-effort and must never change the OAuth outcome.
  }
}

function isSafeOAuthErrorCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z][a-z0-9_]{0,63}$/.test(value)
  );
}

export async function readSafeOAuthErrorCode(
  response: Response,
): Promise<string | undefined> {
  if (response.ok) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  try {
    const body: unknown = await response.clone().json();
    if (
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      isSafeOAuthErrorCode((body as { error?: unknown }).error)
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    // The diagnostic intentionally ignores malformed or non-JSON bodies.
  }

  return undefined;
}
