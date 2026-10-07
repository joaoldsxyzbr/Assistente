import assert from "node:assert/strict";
import test from "node:test";
import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
  handleAuthorizeRequest,
  type OAuthAuthorizationEnvironment,
} from "../src/shared/oauth-authorization.ts";

const strongPassword = "0123456789abcdef0123456789abcdef";
const clientId = "https://chatgpt.example/client.json";
const redirectUri = "https://client.example/callback";
const state = "test-state";

const authRequest = {
  clientId,
  redirectUri,
  scope: ["mcp:read", "mcp:write", "offline_access"],
  state,
  responseType: "code",
  codeChallenge: "test-challenge",
  codeChallengeMethod: "S256",
  issuer: "https://assistente.example.test",
} as AuthRequest;

function authorizationError(description: string): Error & { code: string } {
  const error = new Error(description) as Error & { code: string };
  error.name = "AuthorizationError";
  error.code = "invalid_request";
  return error;
}

function buildHarness() {
  let parseCalls = 0;
  let completeCalls = 0;

  const oauth = {
    async parseAuthRequest(request: Request) {
      parseCalls += 1;
      const url = new URL(request.url);
      if (!url.searchParams.get("client_id")) {
        throw authorizationError("OAuth parameters are not present on this request");
      }
      return authRequest;
    },
    async describeConsent() {
      return {
        clientId: authRequest.clientId,
        clientName: "ChatGPT",
        clientDomain: "chatgpt.example",
        redirectUri: authRequest.redirectUri,
        redirectHost: "client.example",
        redirectIsLoopback: false,
        scope: [...authRequest.scope],
      };
    },
    async completeAuthorization() {
      completeCalls += 1;
      return {
        redirectTo: "https://client.example/callback?authorized=1",
      };
    },
  } as unknown as OAuthHelpers;

  return {
    oauth,
    state: () => ({ parseCalls, completeCalls }),
  };
}

function environment(oauth: OAuthHelpers): OAuthAuthorizationEnvironment {
  return {
    ASSISTENTE_OAUTH_PASSWORD: strongPassword,
    OAUTH_PROVIDER: oauth,
  };
}

function authorizeUrl(): URL {
  const url = new URL("https://assistente.example.test/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", authRequest.scope.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", "test-challenge");
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

function authorizeGetRequest(): Request {
  return new Request(authorizeUrl());
}

function authorizePostRequest(
  password: string,
  decision = "approve",
  withOAuthQuery = true,
): Request {
  const url = withOAuthQuery
    ? authorizeUrl()
    : new URL("https://assistente.example.test/authorize");

  return new Request(url, {
    method: "POST",
    body: new URLSearchParams({ decision, password }),
  });
}

test("GET renders a stateless consent form and sets no consent cookie", async () => {
  const harness = buildHarness();
  const response = await handleAuthorizeRequest(
    authorizeGetRequest(),
    environment(harness.oauth),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);

  const html = await response.text();
  assert.ok(html.includes('<form method="post" action="/authorize?'));
  assert.ok(html.includes("client_id="));
  assert.equal(html.includes('name="handle"'), false);
  assert.deepEqual(harness.state(), { parseCalls: 1, completeCalls: 0 });
});

test("POST revalidates the same OAuth URL and completes without cookies", async () => {
  const harness = buildHarness();

  const response = await handleAuthorizeRequest(
    authorizePostRequest(strongPassword),
    environment(harness.oauth),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://client.example/callback?authorized=1",
  );
  assert.deepEqual(harness.state(), { parseCalls: 1, completeCalls: 1 });
});

test("incorrect password returns retry form without parsing OAuth again", async () => {
  const harness = buildHarness();

  const response = await handleAuthorizeRequest(
    authorizePostRequest("incorrect-password"),
    environment(harness.oauth),
  );

  assert.equal(response.status, 401);
  const html = await response.text();
  assert.ok(html.includes("Senha incorreta"));
  assert.ok(html.includes('<form method="post" action="/authorize?'));
  assert.deepEqual(harness.state(), { parseCalls: 0, completeCalls: 0 });
});

test("POST without the original OAuth query is rejected", async () => {
  const harness = buildHarness();

  const response = await handleAuthorizeRequest(
    authorizePostRequest(strongPassword, "approve", false),
    environment(harness.oauth),
  );

  assert.equal(response.status, 400);
  assert.ok((await response.text()).includes("authorization_request_invalid"));
  assert.deepEqual(harness.state(), { parseCalls: 1, completeCalls: 0 });
});

test("deny uses the validated OAuth redirect", async () => {
  const harness = buildHarness();

  const response = await handleAuthorizeRequest(
    authorizePostRequest("", "deny"),
    environment(harness.oauth),
  );

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin + location.pathname, redirectUri);
  assert.equal(location.searchParams.get("error"), "access_denied");
  assert.equal(location.searchParams.get("state"), state);
  assert.deepEqual(harness.state(), { parseCalls: 1, completeCalls: 0 });
});

test("repeated valid POSTs do not depend on one-time browser state", async () => {
  const harness = buildHarness();

  const first = await handleAuthorizeRequest(
    authorizePostRequest(strongPassword),
    environment(harness.oauth),
  );
  const second = await handleAuthorizeRequest(
    authorizePostRequest(strongPassword),
    environment(harness.oauth),
  );

  assert.equal(first.status, 302);
  assert.equal(second.status, 302);
  assert.deepEqual(harness.state(), { parseCalls: 2, completeCalls: 2 });
});
