import { audit } from "./audit.js";
import {
  ASSISTENTE_OAUTH_SCOPES,
  hasValidOAuthPassword,
  isOAuthPasswordConfigured,
  renderConsentPage,
  renderPasswordRetryPage
} from "./oauth-helpers.js";
const OWNER_USER_ID = "owner";
const SUPPORTED_SCOPES = new Set(ASSISTENTE_OAUTH_SCOPES);
function htmlResponse(html, status = 200) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY"
  });
  return new Response(html, { status, headers });
}
function formActionFor(request) {
  const url = new URL(request.url);
  return url.pathname + url.search;
}
function accessDeniedRedirect(request) {
  const redirect = new URL(request.redirectUri);
  redirect.searchParams.set("error", "access_denied");
  if (request.state !== void 0) redirect.searchParams.set("state", request.state);
  if (request.issuer !== void 0) redirect.searchParams.set("iss", request.issuer);
  return redirect.toString();
}
function isAuthorizationError(error) {
  return error instanceof Error && error.name === "AuthorizationError" && typeof error.code === "string";
}
function logOAuthFailure(stage, category, code, status) {
  console.warn(JSON.stringify({
    event: "oauth_authorization_failure",
    stage,
    category,
    code,
    status
  }));
}
function authorizationErrorResponse(error, stage) {
  if (isAuthorizationError(error)) {
    const status = error.redirectTo ? 302 : 400;
    logOAuthFailure(
      stage,
      "authorization_request_invalid",
      error.code,
      status
    );
    if (error.redirectTo) return Response.redirect(error.redirectTo, 302);
    return htmlResponse(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Autoriza\xE7\xE3o inv\xE1lida</title><h1>Solicita\xE7\xE3o OAuth inv\xE1lida</h1><p>Inicie a conex\xE3o novamente no ChatGPT.</p><p>C\xF3digo de diagn\xF3stico: <code>authorization_request_invalid</code></p>',
      400
    );
  }
  if (error instanceof Error && error.name === "CimdFetchError") {
    logOAuthFailure(stage, "client_metadata", "metadata_resolution_failed", 400);
    return htmlResponse(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Cliente n\xE3o verificado</title><h1>N\xE3o foi poss\xEDvel verificar o cliente OAuth</h1><p>Inicie a conex\xE3o novamente depois de conferir a URL do servidor.</p>',
      400
    );
  }
  return void 0;
}
async function issueAuthorization(oauth, request) {
  const scope = request.scope.filter((item) => SUPPORTED_SCOPES.has(item));
  const completed = await oauth.completeAuthorization({
    request,
    userId: OWNER_USER_ID,
    metadata: {},
    scope,
    props: { userId: OWNER_USER_ID }
  });
  audit("info", "oauth_authorization_completed", {
    status: 302,
    scopes: scope
  });
  return Response.redirect(completed.redirectTo, 302);
}
async function authorizeGet(request, oauth) {
  try {
    const authorizationRequest = await oauth.parseAuthRequest(request);
    const details = await oauth.describeConsent(authorizationRequest);
    return htmlResponse(
      renderConsentPage(details, formActionFor(request))
    );
  } catch (error) {
    const response = authorizationErrorResponse(error, "authorize_get");
    if (response !== void 0) return response;
    throw error;
  }
}
async function authorizePost(request, oauth, password) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return new Response("Solicita\xE7\xE3o inv\xE1lida", { status: 400 });
  }
  const decision = form.get("decision");
  if (decision !== "approve" && decision !== "deny") {
    return new Response("Solicita\xE7\xE3o inv\xE1lida", { status: 400 });
  }
  if (decision === "approve" && !hasValidOAuthPassword(password, form.get("password"))) {
    audit("warn", "oauth_password_rejected", {
      stage: "authorize_post",
      status: 401
    });
    return htmlResponse(
      renderPasswordRetryPage(formActionFor(request)),
      401
    );
  }
  try {
    const authorizationRequest = await oauth.parseAuthRequest(request);
    if (decision === "deny") {
      audit("info", "oauth_authorization_denied", { status: 302 });
      return Response.redirect(accessDeniedRedirect(authorizationRequest), 302);
    }
    return issueAuthorization(oauth, authorizationRequest);
  } catch (error) {
    const response = authorizationErrorResponse(error, "authorize_post");
    if (response !== void 0) return response;
    throw error;
  }
}
async function handleAuthorizeRequest(request, environment) {
  if (new URL(request.url).pathname !== "/authorize") {
    return new Response("Not found", { status: 404 });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" }
    });
  }
  const password = environment.ASSISTENTE_OAUTH_PASSWORD;
  if (password === void 0 || !isOAuthPasswordConfigured(password)) {
    return htmlResponse(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>OAuth n\xE3o configurado</title><h1>Autoriza\xE7\xE3o ainda n\xE3o configurada</h1><p>O administrador precisa definir o segredo ASSISTENTE_OAUTH_PASSWORD no Worker.</p>',
      503
    );
  }
  const oauth = environment.OAUTH_PROVIDER;
  if (oauth === void 0) {
    return new Response("OAuth n\xE3o configurado", { status: 503 });
  }
  return request.method === "GET" ? authorizeGet(request, oauth) : authorizePost(request, oauth, password);
}
export {
  handleAuthorizeRequest
};
