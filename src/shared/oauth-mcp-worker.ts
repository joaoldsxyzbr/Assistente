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
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" },
        });
      }

      const isWriteCall = await requestUsesWriteTool(request, [...writeToolNames]);
      const requiredScopes = requiredOAuthScopesForToolCall(isWriteCall);
      if (!hasAllOAuthScopes(auth.scope, requiredScopes)) {
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
}
