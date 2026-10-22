import { readdir, readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { githubFetch } from "../helpers/upstream-fixtures.js";
import test from "node:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import assert from "node:assert/strict";
test(
  "Workerd handles OAuth, PKCE and authenticated MCP without Node-only APIs",
  { timeout: 30000 },
  async () => {
    // Test the Worker bundle produced by official Cloudflare Wrangler.
    const bundleDirectory = new URL("../../.wrangler-build/assistente/", import.meta.url);
    const scripts = (await readdir(bundleDirectory)).filter(name => name.endsWith(".js"));
    assert.equal(scripts.length, 1, "Wrangler must generate exactly one Worker bundle");
    const bundle = await readFile(new URL(scripts[0], bundleDirectory), "utf8");
    const fake = githubFetch();
    const calls = [];
    const upstreamUrl = "https://api.githubcopilot.com/mcp/x/all";
    const mockUpstream = async (request) => {
      // Requests to a real GitHub MCP go through OAuth-backed Streamable HTTP.
      if (request.url !== upstreamUrl || request.method !== "POST" || !request.headers.has("authorization")) return null;
      const rpc = await request.json();
      if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
      let result;
      if (rpc.method === "initialize") {
        result = {
          protocolVersion: rpc.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "mock-github", version: "1.0" }
        };
      } else if (rpc.method === "tools/call") {
        calls.push(rpc.params.name);
        if (rpc.params.name === "fail_write") return new Response("temporarily unavailable", { status: 503 });
        result = { content: [{ type: "text", text: "upstream:" + rpc.params.name }] };
        if (rpc.params.name === "sse_read") {
          const rpcResponse = JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result });
          return new Response("event: message\ndata: " + rpcResponse + "\n\n", {
            headers: { "content-type": "text/event-stream" }
          });
        }
      } else {
        result = { tools: [{ name: "get_me", description: "Read identity", inputSchema: { type: "object" } }] };
      }
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    };
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        workers: [
          {
            name: "audit",
            modules: true,
            script: bundle,
            compatibilityDate: "2026-10-07",
            compatibilityFlags: ["global_fetch_strictly_public"],
            kvNamespaces: ["OAUTH_KV"],
            bindings: {
              PUBLIC_ORIGIN: "https://assistente.example",
              ASSISTENTE_OAUTH_PASSWORD: "a".repeat(40),
              UPSTREAM_OAUTH_ENCRYPTION_KEY: "A".repeat(43),
              GITHUB_OAUTH_CLIENT_ID: "github-client",
              GITHUB_OAUTH_CLIENT_SECRET: "github-secret",
              GITHUB_EXPECTED_LOGIN: "joaoldsxyzbr",
            },
            outboundService: async (r) => {
              const matched = await mockUpstream(r);
              if (matched) return matched;
              if (r.url === upstreamUrl && r.method === "GET" && r.headers.has("authorization")) {
                return new Response(null, { status: 405 });
              }
              return fake(r.url, {
                method: r.method,
                headers: r.headers,
                redirect: "manual",
                body: r.method === "POST" ? await r.text() : undefined,
              });
            },
          },
        ],
      }),
    );
    try {
      const start = await mf.dispatchFetch(
        "https://assistente.example/connections/github/start",
        {
          method: "POST",
          headers: {
            origin: "https://assistente.example",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ password: "a".repeat(40) }).toString(),
          redirect: "manual",
        },
      );
      assert.equal(start.status, 303, await start.text());
      const auth = new URL(start.headers.get("location"));
      const cb = new URL(
        "https://assistente.example/connections/github/callback",
      );
      cb.searchParams.set("state", auth.searchParams.get("state"));
      cb.searchParams.set("code", "temporary-code");
      cb.searchParams.set("iss", "https://github.com/login/oauth");
      const result = await mf.dispatchFetch(cb.href);
      assert.equal(result.status, 200, await result.text());
      const mcp = await mf.dispatchFetch("https://assistente.example/mcp");
      assert.equal(mcp.status, 401);
      const registration = await mf.dispatchFetch(
        "https://assistente.example/oauth/register",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            client_name: "Audit client",
            redirect_uris: ["https://client.example/callback"],
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
          }),
        },
      );
      assert.equal(registration.status, 201, await registration.clone().text());
      const registered = await registration.json();
      const verifier = "v".repeat(43);
      const digest = Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ).toString("base64url");
      const authUrl = new URL("https://assistente.example/authorize");
      for (const [k, v] of Object.entries({
        client_id: registered.client_id,
        redirect_uri: "https://client.example/callback",
        response_type: "code",
        state: "audit-state",
        scope: "mcp:read mcp:write offline_access",
        code_challenge: digest,
        code_challenge_method: "S256",
        resource: "https://assistente.example/mcp",
      }))
        authUrl.searchParams.set(k, v);
      const consent = await mf.dispatchFetch(authUrl.href, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          password: "a".repeat(40),
          decision: "approve",
        }).toString(),
        redirect: "manual",
      });
      assert.equal(consent.status, 302, await consent.text());
      const code = new URL(consent.headers.get("location")).searchParams.get(
        "code",
      );
      const tokenResponse = await mf.dispatchFetch(
        "https://assistente.example/oauth/token",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: registered.client_id,
            code,
            redirect_uri: "https://client.example/callback",
            code_verifier: verifier,
            resource: "https://assistente.example/mcp",
          }).toString(),
        },
      );
      assert.equal(
        tokenResponse.status,
        200,
        await tokenResponse.clone().text(),
      );
      const token = await tokenResponse.json();
      const client = new Client({ name: "audit", version: "1" });
      const transport = new StreamableHTTPClientTransport(
        new URL("https://assistente.example/mcp"),
        {
          requestInit: {
            headers: { authorization: "Bearer " + token.access_token },
          },
          fetch: (url, init) => mf.dispatchFetch(String(url), init),
        },
      );
      try {
        await client.connect(transport);
        const list = await client.listTools();
        assert.equal(list.tools.length, 17);
         for (const toolName of ["github_ler_arquivo", "github_branches", "github_criar_branch", "github_criar_pr"]) {
           assert.ok(list.tools.some(tool => tool.name === toolName), "Atalho ausente: " + toolName);
         }
         const directRead = await client.callTool({
           name: "github_branches", arguments: { owner: "test", repo: "test" }
         });
         assert.equal(directRead.isError, false, JSON.stringify(directRead));
         assert.equal(directRead.content[0].text, "upstream:list_branches");
        assert.ok(list.tools.some(tool => tool.name === "github_edit_file"));
        assert.ok(list.tools.some(tool => tool.name === "github_relocate_directory"));
        const unexpected = ["mcp_github_tools", "mcp_github_call", "mcp_cloudflare_tools", "mcp_cloudflare_call"];
        for (const name of unexpected) assert.ok(!list.tools.some(t => t.name === name));
        const cloudflareNames = ["cloudflare_contas", "cloudflare_workers", "cloudflare_bancos_d1", "cloudflare_documentacao"];
        for (const name of cloudflareNames) assert.ok(list.tools.some(t => t.name === name));
        const cf = await client.callTool({ name: "cloudflare_contas", arguments: {} });
        assert.equal(cf.isError, true);
        assert.match(cf.content[0].text, /AUTHORIZATION/);
      } finally {
        await client.close();
      }
      console.log(
        "Workerd OAuth upstream start303/callback200; MCP401; full client registration, consent, PKCE token exchange, authenticated initialize and seven tools verified",
      );
    } finally {
      await mf.dispose();
    }
  },
);