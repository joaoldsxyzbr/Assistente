import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("controle de PC está aposentado sem código, relay ou workflow de release", async () => {
  const retiredPaths = [
    "src/pc-agent",
    "src/mcps/pc",
    "tests/pc-tools.test.ts",
    "docs/CONTROLE-PC.md",
    "docs/RELEASE-PC.md",
    ".github/workflows/release-pc.yml",
  ];
  for (const path of retiredPaths) {
    await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
  }

  const worker = await readFile(new URL("src/host/worker.ts", root), "utf8");
  assert.doesNotMatch(worker, /PcRelay|PC_TOOL_CATALOG|pcAgentRequest|pcCall|PC_RELAY|\/pc\/connect/);

  const configuration = JSON.parse(
    await readFile(new URL("wrangler.assistente.jsonc", root), "utf8"),
  );
  assert.equal(configuration.exports?.PcRelay, undefined);
  assert.equal(configuration.compatibility_flags.includes("enable_ctx_exports"), false);
  assert.equal(configuration.main, "src/host/worker.ts");
});
