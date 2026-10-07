import assert from "node:assert/strict";
import test from "node:test";
import {
  hasValidOAuthPassword,
  isOAuthPasswordConfigured,
  renderConsentPage,
  requestUsesWriteTool,
} from "../src/shared/oauth-helpers.ts";

const strongPassword = "0123456789abcdef0123456789abcdef";
const writeTools = ["mcp_cloudflare__execute"] as const;

test("requires a high-entropy OAuth password and compares it exactly", () => {
  assert.equal(isOAuthPasswordConfigured(strongPassword), true);
  assert.equal(isOAuthPasswordConfigured("too-short"), false);
  assert.equal(hasValidOAuthPassword(strongPassword, strongPassword), true);
  assert.equal(hasValidOAuthPassword(strongPassword, strongPassword + "x"), false);
  assert.equal(hasValidOAuthPassword(strongPassword, null), false);
  assert.equal(hasValidOAuthPassword(undefined, strongPassword), false);
});

test("requires write scope for the Cloudflare execute tool without consuming the request", async () => {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "mcp_cloudflare__execute", arguments: { code: "return 1" } },
  };
  const request = new Request("https://assistente.example.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });

  assert.equal(await requestUsesWriteTool(request, writeTools), true);
  assert.deepEqual(await request.json(), body);
});

test("detects write calls in JSON-RPC batches and ignores read calls", async () => {
  const batch = new Request("https://assistente.example.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "mcp_cloudflare__execute", arguments: {} },
      },
    ]),
  });
  const read = new Request("https://assistente.example.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "mcp_cloudflare__docs", arguments: { query: "Workers" } },
    }),
  });

  assert.equal(await requestUsesWriteTool(batch, writeTools), true);
  assert.equal(await requestUsesWriteTool(read, writeTools), false);
});

test("escapes OAuth client-controlled content before rendering consent", () => {
  const html = renderConsentPage({
    clientName: "<script>alert(1)</script>",
    clientDomain: "chatgpt.example",
    redirectHost: "client.example",
    redirectIsLoopback: false,
    scope: ["mcp:read", "<img src=x>"],
  }, "handle\"><script>");

  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<img src=x>"), false);
  assert.ok(html.includes("&#60;script&#62;"));
  assert.ok(html.includes("&#60;img"));
});
