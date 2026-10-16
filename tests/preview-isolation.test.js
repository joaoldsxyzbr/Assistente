import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("Cloudflare Worker Previews t\xEAm configura\xE7\xE3o pr\xF3pria sem recursos de produ\xE7\xE3o", async () => {
  const config = JSON.parse(
    await readFile(new URL("../wrangler.assistente.jsonc", import.meta.url), "utf8")
  );
  assert.ok(Object.hasOwn(config, "previews"), "wrangler preview exige um bloco previews");
  assert.deepEqual(config.previews, {}, "previews somente de build; nunca herdar KV/D1/secrets reais");
  assert.equal(config.kv_namespaces?.[0]?.binding, "OAUTH_KV");
  assert.equal(config.d1_databases, void 0);
  assert.equal(config.workers_dev, false);
});
