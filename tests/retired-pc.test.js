import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
test("controle de PC est\xE1 aposentado sem c\xF3digo, relay ou workflow de release", async () => {
  const retiredPaths = [
    "src/pc-agent",
    "mcps/pc",
    "tests/pc-tools.test.js",
    "docs/CONTROLE-PC.md",
    "docs/RELEASE-PC.md",
    ".github/workflows/release-pc.yml"
  ];
  for (const path of retiredPaths) {
    await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
  }
  const worker = await readFile(new URL("server/worker.js", root), "utf8");
  assert.doesNotMatch(worker, /PcRelay|PC_TOOL_CATALOG|pcAgentRequest|pcCall|PC_RELAY|\/pc\/connect/);
  const configuration = JSON.parse(
    await readFile(new URL("wrangler.assistente.jsonc", root), "utf8")
  );
  assert.equal(configuration.exports?.PcRelay, void 0);
  assert.equal(configuration.durable_objects?.bindings?.length ?? 0, 0);
  assert.equal(configuration.compatibility_flags.includes("enable_ctx_exports"), false);
  assert.equal(configuration.main, "server/worker.js");
});
