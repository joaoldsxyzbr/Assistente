import assert from "node:assert/strict";
import test from "node:test";
import { CLOUDFLARE_READ_TOOL_CATALOG, buildCloudflareReadCode, validCloudflareId } from "../mcps/cloudflare/operations.js";
const ids = { ponto: "96b39cda-f037-4259-b406-09fea5431469", gastos: "0c6c31c2-f2fd-4f60-9c75-b232019ae63f" };
test("operacoes Cloudflare novas sao somente leitura e sem parametros livres de API", () => {
  assert.equal(CLOUDFLARE_READ_TOOL_CATALOG.length, 5);
  assert.ok(CLOUDFLARE_READ_TOOL_CATALOG.every(t => !t.isWrite));
  assert.ok(CLOUDFLARE_READ_TOOL_CATALOG.every(t => t.inputSchema.additionalProperties === false));
});
test("consulta de estrutura D1 restringe ao banco canonico", () => {
  assert.equal(validCloudflareId(ids.ponto), true);
  assert.equal(validCloudflareId("outro"), false);
  const result = buildCloudflareReadCode("cloudflare_d1_estrutura", { banco: "ponto" }, ids);
  assert.match(result, /sqlite_master/);
  assert.ok(result.includes(ids.ponto));
  assert.ok(!result.includes(ids.gastos));
  assert.equal(buildCloudflareReadCode("cloudflare_d1_estrutura", { banco: "ponto" }, { ponto: ids.gastos, gastos: ids.gastos }), undefined);
});
test("diagnostico restringe nome do Worker e apenas faz GET", () => {
  assert.equal(buildCloudflareReadCode("cloudflare_worker_diagnostico", { nome: "../admin" }, ids), undefined);
  const code = buildCloudflareReadCode("cloudflare_worker_diagnostico", { nome: "assistente" }, ids);
  assert.match(code, /\/deployments/);
  assert.match(code, /\/versions/);
  assert.ok(!code.includes('method: "POST"'));
  for (const def of CLOUDFLARE_READ_TOOL_CATALOG) {
    const args = def.name === "cloudflare_d1_estrutura" ? { banco: "gastos" } :
      def.name === "cloudflare_worker_diagnostico" ? { nome: "assistente" } :
      def.name === "cloudflare_build_logs" ? { build_id: ids.ponto } : {};
    assert.doesNotThrow(() => new Function("return (" + buildCloudflareReadCode(def.name, args, ids) + ")"));
  }
});
test("logs de build só aceitam UUID e consultas fixas", () => {
  assert.equal(buildCloudflareReadCode("cloudflare_build_logs", { build_id: "../other" }, ids), undefined);
  const code = buildCloudflareReadCode("cloudflare_build_logs", { build_id: ids.gastos }, ids);
  assert.match(code, /\/builds\/builds\//);
  assert.match(code, /method: "GET"/);
});
