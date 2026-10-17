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
import { handleAuthorizeRequest } from "./oauth-authorization.js";
import { handleUpstreamRoutes } from "../upstream-oauth.js";

// Native Cloudflare rate limiting (per location), never keyed by a bearer token.
async function enforceRateLimit(binding, key, event) {
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

function createOAuthMcpWorker(options) {
  const writeToolNames = new Set(options.writeToolNames);
  const apiHandler = {
    async fetch(request, environment, context) {
      const traceId = crypto.randomUUID();
      const startedAt = Date.now();
      const auth = context.auth;
      if (auth === undefined) {
        audit("warn", "mcp_authentication_denied", { status: 401, traceId });
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" }
        });
      }
      const actor = String(auth.props?.userId ?? auth.userId ?? "owner");
      const rateLimited = await enforceRateLimit(environment.MCP_RATE_LIMITER, "mcp:" + actor, "mcp_rate_limit");
      if (rateLimited) return rateLimited;
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
    async fetch(request, environment) {
      const pathname = new URL(request.url).pathname;
      const passwordForm = request.method === "POST" &&
        (pathname === "/authorize" || (pathname.startsWith("/connections/") &&
        ["/start", "/disconnect"].some(suffix => pathname.endsWith(suffix)) &&
        ["/github/", "/cloudflare/"].some(part => pathname.includes(part))));
      if (passwordForm) {
        // The source address is supplied by Cloudflare at the edge, not by the HTML form.
        const actor = request.headers.get("cf-connecting-ip") ?? "unknown";
        const rateLimited = await enforceRateLimit(environment.AUTH_RATE_LIMITER, "authorization:" + actor, "oauth_rate_limit");
        if (rateLimited) return rateLimited;
      }
      const upstream = await handleUpstreamRoutes(request, environment);
      return upstream ?? handleAuthorizeRequest(request, environment);
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
      const category = internal === undefined ? "provider_error" : internal.category + "." + internal.reason;
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
export { createOAuthMcpWorker };
