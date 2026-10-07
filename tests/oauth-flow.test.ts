import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthorizationError,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
  handleAuthorizeRequest,
  type OAuthMcpEnvironment,
} from "../src/shared/oauth-mcp-worker.ts";

const strongPassword = "0123456789abcdef0123456789abcdef";
const consentHandle = "test-consent-handle";
const cookieName = "__Host-oauth-consent-test";
const cookieValue = "test-cookie-binding";
const cookiePair = `${cookieName}=${cookieValue}`;

const clientId = "https://chatgpt.example/client.json";
const redirectUri = "https://client.example/callback";
const state = "test-state";
const codeChallenge = "test-challenge";
const codeChallengeMethod = "S256";

const authRequest = {
  clientId,
  redirectUri,
  scope: ["mcp:read", "mcp:write", "offline_access"],
  state,
  responseType: "code",
  codeChallenge,
  codeChallengeMethod,
} as AuthRequest;

function buildHarness() {
  let transactionActive = false;
  let parseCalls = 0;
  let approveCalls = 0;
  let completeCalls = 0;

  const oauth = {
    async parseAuthRequest(request: Request) {
      parseCalls += 1;
      const url = new URL(request.url);
      if (request.method !== "GET" || !url.searchParams.get("client_id")) {
        throw new AuthorizationError("invalid_request", {
          description: "OAuth parameters are not present on this request",
        });
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
    async beginConsent() {
      transactionActive = true;
      return {
        handle: consentHandle,
        headers: new Headers({
          "Set-Cookie":
            `${cookiePair}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
        }),
      };
    },
    async approveConsent(request: Request, handle: string) {
      approveCalls += 1;
      if (handle !== consentHandle) {
        throw new AuthorizationError("invalid_request", {
          description: "Missing transaction handle",
        });
      }
      if (!request.headers.get("cookie")?.includes(cookiePair)) {
        throw new AuthorizationError("invalid_request", {
          description:
            "This authorization was not started in this browser; start again",
        });
      }
      if (!transactionActive) {
        throw new AuthorizationError("invalid_request", {
          description:
            "This authorization expired or was already used; start again",
        });
      }

      transactionActive = false;
      return {
        request: authRequest,
        headers: new Headers({
          "Set-Cookie":
            `${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
        }),
      };
    },
    async denyConsent() {
      transactionActive = false;
      return {
        request: authRequest,
        redirectTo: "https://client.example/callback?denied=1",
        headers: new Headers({
          Location: "https://client.example/callback?denied=1",
        }),
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
    expire: () => {
      transactionActive = false;
    },
    state: () => ({
      transactionActive,
      parseCalls,
      approveCalls,
      completeCalls,
    }),
  };
}

function environment(oauth: OAuthHelpers): OAuthMcpEnvironment {
  return {
    ASSISTENTE_OAUTH_PASSWORD: strongPassword,
    OAUTH_PROVIDER: oauth,
  };
}

function authorizeGetRequest(): Request {
  const url = new URL("https://assistente.example.test/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", authRequest.scope.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", codeChallengeMethod);
  return new Request(url);
}

function authorizePostRequest(password: string, cookie?: string): Request {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("Cookie", cookie);

  return new Request("https://assistente.example.test/authorize", {
    method: "POST",
    headers,
    body: new URLSearchParams({
      handle: consentHandle,
      decision: "approve",
      password,
    }),
  });
}

async function startConsent(harness: ReturnType<typeof buildHarness>) {
  const response = await handleAuthorizeRequest(
    authorizeGetRequest(),
    environment(harness.oauth),
  );

  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.notEqual(setCookie, null);
  if (setCookie === null) throw new Error("Consent cookie was not returned");
  assert.ok(setCookie.startsWith(cookiePair));

  const html = await response.text();
  assert.ok(html.includes('<form method="post" action="/authorize">'));
  assert.ok(html.includes(`name="handle" value="${consentHandle}"`));
  assert.equal(html.includes('name="client_id"'), false);
  assert.equal(html.includes('name="redirect_uri"'), false);
  assert.equal(html.includes('name="state"'), false);

  return setCookie.split(";")[0]!;
}

test("completes consent from the stored transaction even when POST has no OAuth query", async () => {
  const harness = buildHarness();
  const cookie = await startConsent(harness);

  const response = await handleAuthorizeRequest(
    authorizePostRequest(strongPassword, cookie),
    environment(harness.oauth),
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://client.example/callback?authorized=1",
  );
  assert.deepEqual(harness.state(), {
    transactionActive: false,
    parseCalls: 1,
    approveCalls: 1,
    completeCalls: 1,
  });
});

test("keeps the consent transaction available after an incorrect password", async () => {
  const harness = buildHarness();
  const cookie = await startConsent(harness);

  const response = await handleAuthorizeRequest(
    authorizePostRequest("incorrect-password", cookie),
    environment(harness.oauth),
  );

  assert.equal(response.status, 401);
  assert.ok((await response.text()).includes("Senha incorreta"));
  assert.deepEqual(harness.state(), {
    transactionActive: true,
    parseCalls: 1,
    approveCalls: 0,
    completeCalls: 0,
  });
});

test("rejects approval when the browser-bound consent cookie is missing", async () => {
  const harness = buildHarness();
  await startConsent(harness);

  const response = await handleAuthorizeRequest(
    authorizePostRequest(strongPassword),
    environment(harness.oauth),
  );

  assert.equal(response.status, 400);
  assert.ok((await response.text()).includes("Solicitação OAuth inválida ou expirada"));
  assert.deepEqual(harness.state(), {
    transactionActive: true,
    parseCalls: 1,
    approveCalls: 1,
    completeCalls: 0,
  });
});

test("rejects an expired or already-consumed consent transaction", async () => {
  const harness = buildHarness();
  const cookie = await startConsent(harness);
  harness.expire();

  const response = await handleAuthorizeRequest(
    authorizePostRequest(strongPassword, cookie),
    environment(harness.oauth),
  );

  assert.equal(response.status, 400);
  assert.ok((await response.text()).includes("Solicitação OAuth inválida ou expirada"));
  assert.deepEqual(harness.state(), {
    transactionActive: false,
    parseCalls: 1,
    approveCalls: 1,
    completeCalls: 0,
  });
});
