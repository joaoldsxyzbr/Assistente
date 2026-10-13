import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Cloudflare Worker Previews têm configuração própria sem recursos de produção", async () => {
  const config = JSON.parse(
    await readFile(new URL("../wrangler.assistente.jsonc", import.meta.url), "utf8"),
  );

  assert.ok(Object.hasOwn(config, "previews"), "wrangler preview exige um bloco previews");
  assert.deepEqual(config.previews, {}, "previews somente de build; nunca herdar KV/D1/secrets reais");
  assert.equal(config.kv_namespaces?.[0]?.binding, "OAUTH_KV");
  assert.equal(config.d1_databases, undefined);
  assert.equal(config.workers_dev, false);
});
