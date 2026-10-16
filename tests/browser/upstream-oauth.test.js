import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { chromium } from "playwright";
import { handleUpstreamRoutes } from "../../server/upstream-oauth.js";
import {
  environment,
  githubFetch,
  cloudflareFetch,
} from "../helpers/upstream-fixtures.js";

async function harness(run, { legacyCsp = false, provider = "github" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "assistente-browser-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=assistente.example",
    ],
    { stdio: "ignore" },
  );
  const env = environment();
  const fetchFn = provider === "github" ? githubFetch() : cloudflareFetch();
  const providerRequests = [];
  const errors = [];
  const server = createServer(
    {
      key: await readFile(join(dir, "key.pem")),
      cert: await readFile(join(dir, "cert.pem")),
    },
    async (incoming, outgoing) => {
      try {
        const url = new URL(incoming.url, "https://" + incoming.headers.host);
        let body = "";
        for await (const chunk of incoming) body += chunk;
        if (url.origin !== env.PUBLIC_ORIGIN) {
          providerRequests.push({
            method: incoming.method,
            body: body || null,
            url: url.href,
          });
          outgoing.writeHead(200, { "content-type": "text/html" });
          outgoing.end("<h1>Consentimento do provedor</h1>");
          return;
        }
        const request = new Request(url, {
          method: incoming.method,
          headers: incoming.headers,
          ...(incoming.method === "POST" ? { body } : {}),
        });
        const response = await handleUpstreamRoutes(request, env, fetchFn);
        const headers = Object.fromEntries(response.headers);
        if (
          legacyCsp &&
          incoming.method === "GET" &&
          url.pathname.endsWith("/start")
        ) {
          headers["content-security-policy"] =
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'";
        }
        outgoing.writeHead(response.status, headers);
        outgoing.end(await response.text());
      } catch (error) {
        errors.push(String(error));
        outgoing.writeHead(500);
        outgoing.end("Test server failure");
      }
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let browser;
  try {
    browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--ignore-certificate-errors",
        "--proxy-server=direct://",
        "--host-resolver-rules=MAP * 127.0.0.1:" +
          server.address().port +
          ", EXCLUDE localhost",
      ],
    });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    page.setDefaultTimeout(10000);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(env.PUBLIC_ORIGIN + "/connections/" + provider + "/start");
    await run({ page, env, providerRequests, errors });
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

test(
  "regression: original CSP blocks the successful OAuth POST redirect in Chromium",
  { timeout: 20000 },
  async () => {
    await harness(
      async ({ page, env, providerRequests, errors }) => {
        await page
          .getByLabel("Senha do Assistente")
          .fill(env.ASSISTENTE_OAUTH_PASSWORD);
        await page.evaluate(() => {
          window.violations = [];
          document.addEventListener("securitypolicyviolation", (event) =>
            window.violations.push({
              directive: event.effectiveDirective,
              blocked: event.blockedURI,
            }),
          );
        });
        const failed = page.waitForEvent("requestfailed");
        await page.getByRole("button", { name: "Autorizar" }).click();
        await failed;
        assert.equal(providerRequests.length, 0);
        await page.waitForFunction(() =>
          window.violations.some((event) => event.directive === "form-action"),
        );
        assert.equal(new URL(page.url()).origin, env.PUBLIC_ORIGIN);
      },
      { legacyCsp: true },
    );
  },
);
for (const provider of ["github", "cloudflare"]) {
  test(
    provider + ": mobile click reaches provider by GET and callback connects",
    async () => {
      await harness(
        async ({ page, env, providerRequests, errors }) => {
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await page
            .getByLabel("Senha do Assistente")
            .fill(env.ASSISTENTE_OAUTH_PASSWORD);
          await page.getByRole("button", { name: "Autorizar" }).click();
          await page
            .getByRole("heading", { name: "Consentimento do provedor" })
            .waitFor();
          assert.equal(providerRequests.length, 1);
          assert.equal(providerRequests[0].method, "GET");
          assert.equal(providerRequests[0].body, null);
          assert.ok(
            !providerRequests[0].url.includes(env.ASSISTENTE_OAUTH_PASSWORD),
          );
          assert.ok(!errors.some((message) => message.includes("form-action")));
          const authorization = new URL(page.url());
          const callback = new URL(
            env.PUBLIC_ORIGIN + "/connections/" + provider + "/callback",
          );
          callback.searchParams.set(
            "state",
            authorization.searchParams.get("state"),
          );
          callback.searchParams.set("code", "temporary-code");
          callback.searchParams.set(
            "iss",
            provider === "github"
              ? "https://github.com/login/oauth"
              : "https://mcp.cloudflare.com",
          );
          await page.goto(callback.href);
          await page.getByRole("heading", { name: /conectado/ }).waitFor();
        },
        { provider },
      );
    },
  );
}
test("wrong password presents retry form and never visits the provider", async () => {
  await harness(async ({ page, providerRequests }) => {
    await page.getByLabel("Senha do Assistente").fill("incorrect");
    await page.getByRole("button", { name: "Autorizar" }).click();
    await page.getByRole("alert").waitFor();
    assert.match(await page.getByRole("alert").innerText(), /Senha incorreta/);
    assert.equal(providerRequests.length, 0);
    assert.equal(await page.getByLabel("Senha do Assistente").inputValue(), "");
  });
});
