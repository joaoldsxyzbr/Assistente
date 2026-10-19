import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("somente configuração produtiva, sem Preview ou D1 direto", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.assistente.jsonc", import.meta.url), "utf8"));
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(config.name, "assistente");
  assert.equal(config.preview_urls, false);
  assert.equal(config.workers_dev, false);
  assert.equal(config.previews, undefined);
  assert.equal(config.env, undefined);
  assert.deepEqual(config.kv_namespaces.map(item => item.binding), ["OAUTH_KV"]);
  assert.equal(config.d1_databases, undefined);
  assert.deepEqual(config.ratelimits.map(item => item.name).sort(), ["AUTH_RATE_LIMITER", "MCP_RATE_LIMITER"]);
  assert.equal(pkg.scripts["deploy:preview"], undefined);
  assert.ok(pkg.scripts["build:workers"].includes("deploy --dry-run"));
  assert.ok(!pkg.scripts["build:workers"].includes("--env preview"));
});
