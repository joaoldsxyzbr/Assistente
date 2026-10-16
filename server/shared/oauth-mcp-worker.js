import {
  OAuthProvider,
  insufficientScope
} from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import {
  ASSISTENTE_OAUTH_SCOPES,
  hasAllOAuthScopes,
  requestUsesWriteTool,
  requiredOAuthScopesForToolCall
} from "./oauth-helpers.js";
import { audit } from "./audit.js";
import {
  handleAuthorizeRequest
} from "./oauth-authorization.js";
function createOAuthMcpWorker(options) {
  const writeToolNames = new Set(options.writeToolNames);
  const apiHandler = {
    async fetch(request, environment, context) {
      const traceId = crypto.randomUUID();
      const startedAt = Date.now();
      const auth = context.auth;
      if (auth === void 0) {
        audit("warn", "mcp_authentication_denied", { status: 401, traceId });
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" }
        });
      }
      const isWriteCall = await requestUsesWriteTool(request, [...writeToolNames]);
      const requiredScopes = requiredOAuthScopesForToolCall(isWriteCall);
      if (!hasAllOAuthScopes(auth.scope, requiredScopes)) {
        audit("warn", "mcp_scope_denied", {
          status: 403,
          write: isWriteCall,
          scopes: requiredScopes,
          traceId
        });
        return insufficientScope(
          auth,
          [...requiredScopes],
          isWriteCall ? "This operation can modify connected resources." : "This operation requires read access."
        );
      }
      const handler = createMcpHandler(
        () => options.createServer(environment, traceId),
        { route: "/mcp" }
      );
      const response = await handler(request, environment, context);
      audit(response.ok ? "info" : "warn", "mcp_request", {
        status: response.status,
        write: isWriteCall,
        outcome: response.ok ? "accepted" : "rejected",
        traceId,
        durationMs: Date.now() - startedAt
      });
      return response;
    }
  };
  const defaultHandler = {
    fetch(request, environment) {
      return handleAuthorizeRequest(request, environment);
    }
  };
  const provider = new OAuthProvider({
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
      resource_name: options.resourceName
    },
    clientIdMetadataDocumentEnabled: true,
    onError({ code, status, internal }) {
      const category = internal === void 0 ? "provider_error" : `${internal.category}.${internal.reason}`;
      console.warn(JSON.stringify({
        event: "oauth_provider_failure",
        stage: "oauth_provider",
        category,
        code,
        status
      }));
    }
  });
  return provider;
}
export {
  createOAuthMcpWorker
};
