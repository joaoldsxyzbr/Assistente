import {
  OAuthProvider,
  insufficientScope,
  type OAuthResourceAuth,
} from "@cloudflare/workers-oauth-provider";
import { createMcpHandler, type StatelessMcpHandler } from "agents/mcp/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  ASSISTENTE_OAUTH_SCOPES,
  hasAllOAuthScopes,
  requestUsesWriteTool,
  requiredOAuthScopesForToolCall,
} from "./oauth-helpers.ts";
import { audit } from "./audit.ts";
import {
  readSafeOAuthErrorCode,
  recordOAuthBoundary,
} from "./oauth-boundary-diagnostics.ts";
import {
  handleAuthorizeRequest,
  type OAuthAuthorizationEnvironment,
} from "./oauth-authorization.ts";

export type OAuthMcpEnvironment = OAuthAuthorizationEnvironment;

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


export function createOAuthMcpWorker<Environment extends OAuthMcpEnvironment>(
  options: OAuthMcpWorkerOptions<Environment>,
): OAuthProvider<Environment> {
  const writeToolNames = new Set(options.writeToolNames);

  const apiHandler = {
    async fetch(request: Request, environment: Environment, context: McpWorkerContext) {
      const auth = (context as OAuthExecutionContext).auth;
      if (auth === undefined) {
        audit("warn", "mcp_authentication_denied", { status: 401 });
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" },
        });
      }

      const isWriteCall = await requestUsesWriteTool(request, [...writeToolNames]);
      const requiredScopes = requiredOAuthScopesForToolCall(isWriteCall);
      if (!hasAllOAuthScopes(auth.scope, requiredScopes)) {
        audit("warn", "mcp_scope_denied", {
          status: 403,
          write: isWriteCall,
          scopes: requiredScopes,
        });
        return insufficientScope(
          auth,
          [...requiredScopes],
          isWriteCall
            ? "This operation can modify Cloudflare resources."
            : "This operation requires read access.",
        );
      }

      const handler = createMcpHandler(
        () => options.createServer(environment),
        { route: "/mcp" },
      );
      const response = await handler(request, environment, context);
      audit(response.ok ? "info" : "warn", "mcp_request", {
        status: response.status,
        write: isWriteCall,
        outcome: response.ok ? "accepted" : "rejected",
      });
      return response;
    },
  };

  const defaultHandler = {
    fetch(request: Request, environment: Environment): Promise<Response> {
      return handleAuthorizeRequest(request, environment);
    },
  };

  const provider = new OAuthProvider<Environment>({
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
    onError({ code, status, internal }) {
      const category = internal === undefined
        ? "provider_error"
        : `${internal.category}.${internal.reason}`;
      console.warn(JSON.stringify({
        event: "oauth_provider_failure",
        stage: "oauth_provider",
        category,
        code,
        status,
      }));
    },
  });

  type ProviderFetch = OAuthProvider<Environment>["fetch"];
  const originalFetch = provider.fetch.bind(provider) as ProviderFetch;

  const instrumentedFetch: ProviderFetch = async (...args) => {
    const [request, environment] = args;
    const pathname = new URL(request.url).pathname;
    const isTokenRequest = pathname === "/oauth/token";
    const isAuthorizeRequest = pathname === "/authorize";

    if (isTokenRequest) {
      audit("info", "oauth_boundary", { stage: "token_request_seen" });
      await recordOAuthBoundary(environment.OAUTH_KV, "token_request_seen");
    }

    try {
      const response = await originalFetch(...args);

      if (isTokenRequest) {
        audit(response.ok ? "info" : "warn", "oauth_boundary", {
          stage: "token_response",
          status: response.status,
        });
        await recordOAuthBoundary(
          environment.OAUTH_KV,
          "token_response",
          response.status,
          await readSafeOAuthErrorCode(response),
        );
      } else if (isAuthorizeRequest && request.method === "POST") {
        audit(response.status < 400 ? "info" : "warn", "oauth_boundary", {
          stage: "authorize_post_response",
          status: response.status,
        });
        await recordOAuthBoundary(
          environment.OAUTH_KV,
          "authorize_post_response",
          response.status,
        );
      } else if (isAuthorizeRequest && request.method === "GET") {
        audit(response.status < 400 ? "info" : "warn", "oauth_boundary", {
          stage: "authorize_get_response",
          status: response.status,
        });
        await recordOAuthBoundary(
          environment.OAUTH_KV,
          "authorize_get_response",
          response.status,
        );
      }

      return response;
    } catch (error) {
      if (isTokenRequest) {
        await recordOAuthBoundary(
          environment.OAUTH_KV,
          "token_handler_exception",
          500,
          "internal_error",
        );
      } else if (isAuthorizeRequest) {
        await recordOAuthBoundary(
          environment.OAUTH_KV,
          "authorize_handler_exception",
          500,
          "internal_error",
        );
      }
      throw error;
    }
  };

  Object.defineProperty(provider, "fetch", {
    configurable: true,
    value: instrumentedFetch,
  });

  return provider;
}
