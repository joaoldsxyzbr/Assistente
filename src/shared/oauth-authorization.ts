import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import type { OAuthDiagnosticStore } from "./oauth-boundary-diagnostics.ts";
import { audit } from "./audit.ts";
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
  OAUTH_KV?: OAuthDiagnosticStore;
};

type OAuthFailureStage = "authorize_get" | "authorize_post";

type AuthorizationErrorLike = Error & {
  code: string;
  redirectTo?: string;
};

const OWNER_USER_ID = "owner";
const SUPPORTED_SCOPES = new Set<string>(ASSISTENTE_OAUTH_SCOPES);

function htmlResponse(
  html: string,
  status = 200,
): Response {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
  });
  return new Response(html, { status, headers });
}

function formActionFor(request: Request): string {
  const url = new URL(request.url);
  return url.pathname + url.search;
}

function accessDeniedRedirect(request: AuthRequest): string {
  const redirect = new URL(request.redirectUri);
  redirect.searchParams.set("error", "access_denied");
  if (request.state !== undefined) redirect.searchParams.set("state", request.state);
  if (request.issuer !== undefined) redirect.searchParams.set("iss", request.issuer);
  return redirect.toString();
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
  code: string,
  status: number,
): void {
  console.warn(JSON.stringify({
    event: "oauth_authorization_failure",
    stage,
    category,
    code,
    status,
  }));
}

function authorizationErrorResponse(
  error: unknown,
  stage: OAuthFailureStage,
): Response | undefined {
  if (isAuthorizationError(error)) {
    const status = error.redirectTo ? 302 : 400;
    logOAuthFailure(
      stage,
      "authorization_request_invalid",
      error.code,
      status,
    );
    if (error.redirectTo) return Response.redirect(error.redirectTo, 302);

    return htmlResponse(
      "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Autorização inválida</title><h1>Solicitação OAuth inválida</h1><p>Inicie a conexão novamente no ChatGPT.</p><p>Código de diagnóstico: <code>authorization_request_invalid</code></p>",
      400,
    );
  }

  if (error instanceof Error && error.name === "CimdFetchError") {
    logOAuthFailure(stage, "client_metadata", "metadata_resolution_failed", 400);
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
): Promise<Response> {
  const scope = request.scope.filter((item) => SUPPORTED_SCOPES.has(item));
  const completed = await oauth.completeAuthorization({
    request,
    userId: OWNER_USER_ID,
    metadata: {},
    scope,
    props: { userId: OWNER_USER_ID },
  });

  audit("info", "oauth_authorization_completed", {
    status: 302,
    scopes: scope,
  });
  return Response.redirect(completed.redirectTo, 302);
}

async function authorizeGet(
  request: Request,
  oauth: OAuthHelpers,
): Promise<Response> {
  try {
    const authorizationRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authorizationRequest);
    return htmlResponse(
      renderConsentPage(details, formActionFor(request)),
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

  const decision = form.get("decision");
  if (decision !== "approve" && decision !== "deny") {
    return new Response("Solicitação inválida", { status: 400 });
  }

  if (
    decision === "approve" &&
    !hasValidOAuthPassword(password, form.get("password"))
  ) {
    audit("warn", "oauth_password_rejected", {
      stage: "authorize_post",
      status: 401,
    });
    return htmlResponse(
      renderPasswordRetryPage(formActionFor(request)),
      401,
    );
  }

  try {
    // The form posts to the exact validated OAuth URL from GET. The provider
    // validates the client, redirect URI, state, scopes and PKCE again here.
    // No browser-bound consent cookie or extra consent transaction is needed.
    const authorizationRequest = await oauth.parseAuthRequest(request);

    if (decision === "deny") {
      audit("info", "oauth_authorization_denied", { status: 302 });
      return Response.redirect(accessDeniedRedirect(authorizationRequest), 302);
    }

    return issueAuthorization(oauth, authorizationRequest);
  } catch (error) {
    const response = authorizationErrorResponse(error, "authorize_post");
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

  return request.method === "GET"
    ? authorizeGet(request, oauth)
    : authorizePost(request, oauth, password);
}
