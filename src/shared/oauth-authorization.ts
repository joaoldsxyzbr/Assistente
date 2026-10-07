import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
  ASSISTENTE_OAUTH_SCOPES,
  hasValidOAuthPassword,
  isOAuthPasswordConfigured,
  renderConsentPage,
  renderPasswordRetryPage,
} from "./oauth-helpers.ts";

export type OAuthAuthorizationEnvironment = Readonly<Record<string, unknown>> & {
  ASSISTENTE_OAUTH_PASSWORD?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
};

type OAuthFailureStage =
  | "authorize_get"
  | "authorize_post_deny"
  | "authorize_post_approve";

type AuthorizationErrorLike = Error & {
  code: string;
  redirectTo?: string;
};

const OWNER_USER_ID = "owner";
const SUPPORTED_SCOPES = new Set<string>(ASSISTENTE_OAUTH_SCOPES);

function htmlResponse(
  html: string,
  status = 200,
  initialHeaders?: HeadersInit,
): Response {
  const headers = new Headers(initialHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  headers.set("X-Frame-Options", "DENY");
  return new Response(html, { status, headers });
}

function isAuthorizationError(error: unknown): error is AuthorizationErrorLike {
  return (
    error instanceof Error &&
    error.name === "AuthorizationError" &&
    typeof (error as Partial<AuthorizationErrorLike>).code === "string"
  );
}

function logOAuthFailure(
  stage: OAuthFailureStage,
  category: string,
  status: number,
): void {
  console.warn(JSON.stringify({
    event: "oauth_authorization_failure",
    stage,
    category,
    status,
  }));
}

function authorizationErrorResponse(
  error: unknown,
  stage: OAuthFailureStage,
): Response | undefined {
  if (isAuthorizationError(error)) {
    const status = error.redirectTo ? 302 : 400;
    logOAuthFailure(stage, error.code, status);
    if (error.redirectTo) return Response.redirect(error.redirectTo, status);
    return htmlResponse(
      "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Autorização inválida</title><h1>Solicitação OAuth inválida ou expirada</h1><p>Inicie a conexão novamente no ChatGPT.</p>",
      400,
    );
  }

  if (error instanceof Error && error.name === "CimdFetchError") {
    logOAuthFailure(stage, "cimd_fetch_error", 400);
    return htmlResponse(
      "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Cliente não verificado</title><h1>Não foi possível verificar o cliente OAuth</h1><p>Inicie a conexão novamente depois de conferir a URL do servidor.</p>",
      400,
    );
  }

  return undefined;
}

async function issueAuthorization(
  oauth: OAuthHelpers,
  request: AuthRequest,
  scope: string[],
  headers?: HeadersInit,
): Promise<Response> {
  const completed = await oauth.completeAuthorization({
    request,
    userId: OWNER_USER_ID,
    metadata: {},
    scope,
    props: { userId: OWNER_USER_ID },
  });
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Location", completed.redirectTo);
  return new Response(null, { status: 302, headers: responseHeaders });
}

async function authorizeGet(
  request: Request,
  oauth: OAuthHelpers,
): Promise<Response> {
  try {
    const authorizationRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authorizationRequest);
    const transaction = await oauth.beginConsent(authorizationRequest);
    return htmlResponse(
      renderConsentPage(details, transaction.handle),
      200,
      transaction.headers,
    );
  } catch (error) {
    const response = authorizationErrorResponse(error, "authorize_get");
    if (response !== undefined) return response;
    throw error;
  }
}

async function authorizePost(
  request: Request,
  oauth: OAuthHelpers,
  password: string,
): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Solicitação inválida", { status: 400 });
  }

  const handleValue = form.get("handle");
  const decisionValue = form.get("decision");
  if (typeof handleValue !== "string" || handleValue.length === 0) {
    return new Response("Solicitação inválida", { status: 400 });
  }

  if (decisionValue === "deny") {
    try {
      const denied = await oauth.denyConsent(request, handleValue);
      return new Response(null, { status: 302, headers: denied.headers });
    } catch (error) {
      const response = authorizationErrorResponse(error, "authorize_post_deny");
      if (response !== undefined) return response;
      throw error;
    }
  }

  if (decisionValue !== "approve") {
    return new Response("Solicitação inválida", { status: 400 });
  }

  if (!hasValidOAuthPassword(password, form.get("password"))) {
    return htmlResponse(renderPasswordRetryPage(handleValue), 401);
  }

  try {
    // The complete OAuth request was validated on GET and stored by
    // beginConsent. On POST, approveConsent re-opens that transaction using
    // the opaque handle plus the browser-bound cookie. Re-parsing the POST URL
    // would incorrectly require the original OAuth query string to survive the
    // form submission.
    const approved = await oauth.approveConsent(request, handleValue);
    const scope = approved.request.scope.filter((item) =>
      SUPPORTED_SCOPES.has(item)
    );
    return issueAuthorization(
      oauth,
      approved.request,
      scope,
      approved.headers,
    );
  } catch (error) {
    const response = authorizationErrorResponse(error, "authorize_post_approve");
    if (response !== undefined) return response;
    throw error;
  }
}

export async function handleAuthorizeRequest(
  request: Request,
  environment: OAuthAuthorizationEnvironment,
): Promise<Response> {
  if (new URL(request.url).pathname !== "/authorize") {
    return new Response("Not found", { status: 404 });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  const password = environment.ASSISTENTE_OAUTH_PASSWORD;
  if (password === undefined || !isOAuthPasswordConfigured(password)) {
    return htmlResponse(
      "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>OAuth não configurado</title><h1>Autorização ainda não configurada</h1><p>O administrador precisa definir o segredo ASSISTENTE_OAUTH_PASSWORD no Worker.</p>",
      503,
    );
  }

  const oauth = environment.OAUTH_PROVIDER;
  if (oauth === undefined) {
    return new Response("OAuth não configurado", { status: 503 });
  }

  if (request.method === "GET") {
    return authorizeGet(request, oauth);
  }
  return authorizePost(request, oauth, password);
}
