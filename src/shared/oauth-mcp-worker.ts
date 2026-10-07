import {
  AuthorizationError,
  OAuthProvider,
  insufficientScope,
  type AuthRequest,
  type OAuthHelpers,
  type OAuthResourceAuth,
} from "@cloudflare/workers-oauth-provider";
import { createMcpHandler, type StatelessMcpHandler } from "agents/mcp/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  ASSISTENTE_OAUTH_SCOPES,
  hasValidOAuthPassword,
  isOAuthPasswordConfigured,
  renderConsentPage,
  renderPasswordRetryPage,
  requestUsesWriteTool,
} from "./oauth-helpers.ts";

export type OAuthMcpEnvironment = Readonly<Record<string, unknown>> & {
  ASSISTENTE_OAUTH_PASSWORD?: string;
  OAUTH_PROVIDER?: OAuthHelpers;
};

export interface OAuthMcpWorkerOptions<Environment extends OAuthMcpEnvironment> {
  resource: string;
  resourceName: string;
  writeToolNames: readonly string[];
  createServer: (environment: Environment) => McpServer;
}

type McpWorkerContext = Parameters<StatelessMcpHandler>[2];
type OAuthExecutionContext = McpWorkerContext & {
  auth?: OAuthResourceAuth;
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

function authorizationErrorResponse(error: unknown): Response | undefined {
  if (error instanceof AuthorizationError) {
    if (error.redirectTo) return Response.redirect(error.redirectTo, 302);
    return htmlResponse(
      "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Autorização inválida</title><h1>Solicitação OAuth inválida ou expirada</h1><p>Inicie a conexão novamente no ChatGPT.</p>",
      400,
    );
  }

  if (error instanceof Error && error.name === "CimdFetchError") {
    return htmlResponse(
      "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Cliente não verificado</title><h1>Não foi possível verificar o cliente OAuth</h1><p>Inicie a conexão novamente depois de conferir a URL do servidor.</p>",
      400,
    );
  }

  return undefined;
}

function authorizationHelpers(environment: OAuthMcpEnvironment): OAuthHelpers | undefined {
  return environment.OAUTH_PROVIDER;
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
  password: string,
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
    const response = authorizationErrorResponse(error);
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
      const response = authorizationErrorResponse(error);
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
    const authorizationRequest = await oauth.parseAuthRequest(request);
    const scope = authorizationRequest.scope.filter((item) =>
      SUPPORTED_SCOPES.has(item)
    );
    const approved = await oauth.approveConsent(request, handleValue, { scope });
    return issueAuthorization(
      oauth,
      approved.request,
      approved.request.scope,
      approved.headers,
    );
  } catch (error) {
    const response = authorizationErrorResponse(error);
    if (response !== undefined) return response;
    throw error;
  }
}

async function handleAuthorizeRequest(
  request: Request,
  environment: OAuthMcpEnvironment,
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
  if (!isOAuthPasswordConfigured(password)) {
    return htmlResponse(
      "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>OAuth não configurado</title><h1>Autorização ainda não configurada</h1><p>O administrador precisa definir o segredo ASSISTENTE_OAUTH_PASSWORD no Worker.</p>",
      503,
    );
  }

  const oauth = authorizationHelpers(environment);
  if (oauth === undefined) {
    return new Response("OAuth não configurado", { status: 503 });
  }

  if (request.method === "GET") {
    return authorizeGet(request, oauth, password);
  }
  return authorizePost(request, oauth, password);
}

export function createOAuthMcpWorker<Environment extends OAuthMcpEnvironment>(
  options: OAuthMcpWorkerOptions<Environment>,
): OAuthProvider<Environment> {
  const writeToolNames = new Set(options.writeToolNames);

  const apiHandler = {
    async fetch(request: Request, environment: Environment, context: McpWorkerContext) {
      const auth = (context as OAuthExecutionContext).auth;
      if (auth === undefined) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" },
        });
      }

      if (
        await requestUsesWriteTool(request, [...writeToolNames]) &&
        !["mcp:read", "mcp:write"].every((scope) => auth.scope.includes(scope))
      ) {
        return insufficientScope(
          auth,
          ["mcp:read", "mcp:write"],
          "This operation can modify Cloudflare resources.",
        );
      }

      const handler = createMcpHandler(
        () => options.createServer(environment),
        { route: "/mcp" },
      );
      return handler(request, environment, context);
    },
  };

  const defaultHandler = {
    fetch(request: Request, environment: Environment): Promise<Response> {
      return handleAuthorizeRequest(request, environment);
    },
  };

  return new OAuthProvider<Environment>({
    apiRoute: "/mcp",
    apiHandler,
    defaultHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: [...ASSISTENTE_OAUTH_SCOPES],
    requiredScopes: ["mcp:read"],
    resourceMetadata: {
      resource: options.resource,
      authorization_servers: [new URL(options.resource).origin],
      bearer_methods_supported: ["header"],
      resource_name: options.resourceName,
    },
    clientIdMetadataDocumentEnabled: true,
  });
}
