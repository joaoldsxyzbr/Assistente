import { createMcpHandler, type StatelessMcpHandler } from "agents/mcp/server";
import type { McpServer } from "@modelcontextprotocol/server";

export type McpWorkerFetchContext = Parameters<StatelessMcpHandler>[2];

export function hasValidBearerToken(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (expectedToken === undefined || expectedToken.length < 32) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  if (authorization === null) {
    return false;
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (match === null) {
    return false;
  }

  const expected = new TextEncoder().encode(expectedToken);
  const supplied = new TextEncoder().encode(match[1]);
  let difference = expected.length ^ supplied.length;
  const length = Math.max(expected.length, supplied.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (expected[index] ?? 0) ^ (supplied[index] ?? 0);
  }

  return difference === 0;
}

export function createAuthenticatedMcpWorker<Environment>(
  createServer: (environment: Environment) => McpServer,
  getToken: (environment: Environment) => string | undefined,
) {
  return {
    fetch(
      request: Request,
      environment: Environment,
      context: McpWorkerFetchContext,
    ): Promise<Response> {
      if (new URL(request.url).pathname !== "/mcp") {
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }

      const token = getToken(environment)?.trim();
      if (!hasValidBearerToken(request, token)) {
        const status = token === undefined || token.length < 32 ? 503 : 401;
        return Promise.resolve(
          new Response(status === 503 ? "MCP authentication is not configured" : "Unauthorized", {
            status,
            headers: { "www-authenticate": "Bearer" },
          }),
        );
      }

      const handler = createMcpHandler(() => createServer(environment), {
        route: "/mcp",
      });
      return handler(request, environment, context);
    },
  };
}
