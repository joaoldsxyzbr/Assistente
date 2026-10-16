import assert from "node:assert/strict";

class MemoryKV {
  values = new Map();
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async put(key, value) {
    this.values.set(key, value);
  }
  async delete(key) {
    this.values.delete(key);
  }
}
function environment(extra = {}) {
  return {
    OAUTH_KV: new MemoryKV(),
    ASSISTENTE_OAUTH_PASSWORD: "a".repeat(40),
    UPSTREAM_OAUTH_ENCRYPTION_KEY: "A".repeat(43),
    PUBLIC_ORIGIN: "https://assistente.example",
    GITHUB_OAUTH_CLIENT_ID: "github-client",
    GITHUB_OAUTH_CLIENT_SECRET: "github-secret",
    GITHUB_EXPECTED_LOGIN: "joaoldsxyzbr",
    ...extra,
  };
}
function post(url, body, origin = "https://assistente.example") {
  return new Request(url, {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}
function githubFetch() {
  let refreshes = 0;
  return async (url, init = {}) => {
    assert.equal(
      init.redirect,
      "manual",
      "OAuth requests must use a Workers-supported redirect mode",
    );
    const target = String(url);
    if (target === "https://api.githubcopilot.com/mcp/x/all") {
      return new Response("", {
        status: 401,
        headers: {
          "www-authenticate":
            'Bearer resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/x/all"',
        },
      });
    }
    if (
      target ===
      "https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/x/all"
    ) {
      return Response.json({
        resource: "https://api.githubcopilot.com/mcp/x/all",
        authorization_servers: ["https://github.com/login/oauth"],
        scopes_supported: ["repo", "read:org"],
      });
    }
    if (
      target ===
      "https://github.com/.well-known/oauth-authorization-server/login/oauth"
    ) {
      return Response.json({
        issuer: "https://github.com/login/oauth",
        authorization_response_iss_parameter_supported: true,
        code_challenge_methods_supported: ["S256"],
        authorization_endpoint: "https://github.com/login/oauth/authorize",
        token_endpoint: "https://github.com/login/oauth/access_token",
      });
    }
    if (target === "https://github.com/login/oauth/access_token") {
      const body = new URLSearchParams(init.body);
      if (body.get("grant_type") === "authorization_code") {
        assert.ok(body.get("code_verifier"));
        return Response.json({
          access_token: "github-access",
          refresh_token: "github-refresh",
          expires_in: -1,
          token_type: "bearer",
        });
      }
      refreshes += 1;
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "github-refresh");
      return Response.json({
        access_token: "github-refreshed",
        refresh_token: "github-refresh-2",
        expires_in: 3600,
      });
    }
    if (target === "https://api.github.com/user") {
      return Response.json({ login: "joaoldsxyzbr" });
    }
    if (target === "https://api.github.com/applications/github-client/token") {
      assert.equal(init.method, "DELETE");
      assert.match(init.headers.get("authorization"), /^Basic /);
      return new Response(null, { status: 204 });
    }
    throw Error("Unexpected URL " + target);
  };
}
function cloudflareFetch() {
  return async (url, init = {}) => {
    assert.equal(
      init.redirect,
      "manual",
      "OAuth requests must use a Workers-supported redirect mode",
    );
    const target = String(url);
    if (target === "https://mcp.cloudflare.com/mcp") {
      return new Response("", {
        status: 401,
        headers: {
          "www-authenticate":
            'Bearer resource_metadata="https://mcp.cloudflare.com/.well-known/oauth-protected-resource/mcp"',
        },
      });
    }
    if (
      target ===
      "https://mcp.cloudflare.com/.well-known/oauth-protected-resource/mcp"
    ) {
      return Response.json({
        resource: "https://mcp.cloudflare.com/mcp",
        authorization_servers: ["https://mcp.cloudflare.com"],
      });
    }
    if (
      target ===
      "https://mcp.cloudflare.com/.well-known/oauth-authorization-server"
    ) {
      return Response.json({
        issuer: "https://mcp.cloudflare.com",
        authorization_response_iss_parameter_supported: true,
        code_challenge_methods_supported: ["S256"],
        authorization_endpoint: "https://mcp.cloudflare.com/authorize",
        token_endpoint: "https://mcp.cloudflare.com/token",
        registration_endpoint: "https://mcp.cloudflare.com/register",
        revocation_endpoint: "https://mcp.cloudflare.com/revoke",
      });
    }
    if (target === "https://mcp.cloudflare.com/register") {
      assert.equal(init.method, "POST");
      return Response.json({
        client_id: "cf-client",
        token_endpoint_auth_method: "none",
      });
    }
    if (target === "https://mcp.cloudflare.com/token") {
      return Response.json({
        access_token: "cf-access",
        refresh_token: "cf-refresh",
        expires_in: 3600,
        token_type: "bearer",
      });
    }
    throw Error("Unexpected URL " + target);
  };
}

export { MemoryKV, environment, post, githubFetch, cloudflareFetch };
