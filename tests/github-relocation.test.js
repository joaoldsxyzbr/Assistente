import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRelocation, planDirectoryRelocation, relocateDirectory, githubJson
} from "../server/github-relocation.js";

const hashes = { a: "a".repeat(40), b: "b".repeat(40), c: "c".repeat(40), d: "d".repeat(40), e: "e".repeat(40) };
const entries = [
  { path: "migration/frontend/login.js", mode: "100644", type: "blob", sha: hashes.a },
  { path: "migration/frontend/scripts/dashboard.js", mode: "100755", type: "blob", sha: hashes.b },
  { path: "migration/frontend/logo.svg", mode: "100644", type: "blob", sha: hashes.c },
  { path: "frontend/login.js", mode: "100644", type: "blob", sha: hashes.a },
  { path: "misc/file.js", mode: "100644", type: "blob", sha: hashes.d }
];
const from = "migration/frontend";
const to = "frontend";
const args = {
  owner: "example", repo: "project", branch: "work/reorganize", from, to
};

test("planning reuses Git blob SHAs and skips already copied files", () => {
  const plan = planDirectoryRelocation(entries, from, to, "copy");
  assert.equal(plan.sourceFiles, 3);
  assert.equal(plan.alreadyCopied, 1);
  assert.equal(plan.copied, 2);
  assert.equal(plan.removed, 0);
  assert.deepEqual(plan.changes, [
    { path: "frontend/scripts/dashboard.js", mode: "100755", type: "blob", sha: hashes.b },
    { path: "frontend/logo.svg", mode: "100644", type: "blob", sha: hashes.c }
  ]);
  assert.equal(JSON.stringify(plan).includes("PRIVATE_FILE_CONTENT"), false);
});

test("move deletes originals atomically and preserves file modes", () => {
  const plan = planDirectoryRelocation(entries, from, to, "move");
  assert.equal(plan.removed, 3);
  assert.equal(plan.changes.filter(e => e.sha === null).length, 3);
  assert.ok(plan.changes.some(e => e.path === "migration/frontend/login.js" && e.sha === null));
  assert.ok(plan.changes.some(e => e.path === "frontend/scripts/dashboard.js" && e.mode === "100755"));
});

test("refuses collisions, source overlap, unknown source and submodules", () => {
  assert.throws(() => planDirectoryRelocation(
    [...entries, { path: "frontend/logo.svg", type: "blob", mode: "100644", sha: hashes.d }],
    from, to), /DESTINATION_CONFLICT/);
  assert.throws(() => planDirectoryRelocation(entries, from, "migration/frontend/new"), /INVALID_DIRECTORY/);
  assert.throws(() => planDirectoryRelocation(entries, "missing", to), /SOURCE_EMPTY/);
  assert.throws(() => planDirectoryRelocation(
    [...entries, { path: "migration/frontend/dependency", type: "commit", sha: hashes.a, mode: "160000" }],
    from, to), /UNSUPPORTED_SUBMODULE/);
  assert.throws(() => planDirectoryRelocation(
    Array.from({ length: 251 }, (_, i) => ({
      path: from + "/" + i + ".js", type: "blob", mode: "100644", sha: hashes.a
    })), from, to), /TOO_MANY_FILES/);
});

test("requires explicit expected SHA and forbids writing to main", () => {
  assert.deepEqual(validateRelocation(args), {
    from, to, branch: args.branch, mode: "copy", dryRun: true
  });
  assert.throws(() => validateRelocation({ ...args, dryRun: false }), /EXPECTED_SHA_REQUIRED/);
  assert.throws(() => validateRelocation({ ...args, branch: "main", dryRun: false,
    expectedHeadSha: hashes.a, message: "Migration commit" }), /PROTECTED_BRANCH/);
  assert.throws(() => validateRelocation({ ...args, branch: "a/../b" }), /INVALID_BRANCH/);
  assert.throws(() => validateRelocation({ ...args, from: "../etc" }), /INVALID_DIRECTORY/);
  assert.throws(() => validateRelocation({ ...args, to: "migration/frontend/nested" }), /INVALID_DIRECTORY/);
});

function mockGithub({ files = entries, truncated = false, failedOn = null, head = hashes.a } = {}) {
  const calls = [];
  const request = async (token, url, options = {}) => {
    assert.equal(token, "fake-oauth-token");
    calls.push({ url, ...options });
    const last = url.split("/").slice(-2).join("/");
    if (failedOn && options.method === failedOn) throw Error("GITHUB_HTTP_422");
    if (url.includes("/git/ref/heads/")) return { object: { sha: head } };
    if (url.includes("/git/commits/" + hashes.a)) return { tree: { sha: hashes.b } };
    if (url.includes("/git/trees/" + hashes.b)) return { truncated, tree: files };
    if (url.endsWith("/git/trees") && options.method === "POST") return { sha: hashes.c };
    if (url.endsWith("/git/commits") && options.method === "POST") return { sha: hashes.d };
    if (options.method === "PATCH") return { object: { sha: hashes.d } };
    throw Error("Unexpected mock URL: " + last);
  };
  return { calls, request };
}

test("preview is read-only and returns SHA/paths without contents", async () => {
  const { request, calls } = mockGithub();
  const preview = await relocateDirectory(args, { token: "fake-oauth-token", request });
  assert.equal(preview.status, "preview");
  assert.equal(preview.headSha, hashes.a);
  assert.equal(preview.sourceFiles, 3);
  assert.equal(preview.copied, 2);
  assert.deepEqual(calls.map(x => x.method ?? "GET"), ["GET", "GET", "GET"]);
  assert.ok(!JSON.stringify(preview).includes("PRIVATE_FILE_CONTENT"));
});

test("execution creates one tree/commit then updates branch without force", async () => {
  const { request, calls } = mockGithub();
  const result = await relocateDirectory({
    ...args, dryRun: false, expectedHeadSha: hashes.a, message: "refactor: move frontend"
  }, { token: "fake-oauth-token", request });
  assert.equal(result.status, "committed");
  assert.equal(result.commitSha, hashes.d);
  assert.deepEqual(calls.map(c => c.method ?? "GET"),
    ["GET", "GET", "GET", "POST", "POST", "PATCH"]);
  assert.equal(calls[3].body.base_tree, hashes.b);
  assert.equal(calls[3].body.tree.length, 2);
  assert.deepEqual(calls[4].body.parents, [hashes.a]);
  assert.deepEqual(calls[5].body, { sha: hashes.d, force: false });
});

test("stale expected HEAD, conflicts and truncated trees never write", async () => {
  const stale = mockGithub();
  await assert.rejects(relocateDirectory({
    ...args, dryRun: false, expectedHeadSha: hashes.e, message: "refactor: move frontend"
  }, { token: "fake-oauth-token", request: stale.request }), /STALE_HEAD/);
  assert.equal(stale.calls.length, 1);
  const truncated = mockGithub({ truncated: true });
  await assert.rejects(relocateDirectory(args, {
    token: "fake-oauth-token", request: truncated.request
  }), /TRUNCATED_TREE/);
  assert.equal(truncated.calls.length, 3);
  const conflict = mockGithub({ files: [
    ...entries, { path: "frontend/logo.svg", type: "blob", mode: "100644", sha: hashes.d }
  ] });
  await assert.rejects(relocateDirectory({ ...args, dryRun: false,
    expectedHeadSha: hashes.a, message: "refactor: move frontend"
  }, { token: "fake-oauth-token", request: conflict.request }), /DESTINATION_CONFLICT/);
  assert.equal(conflict.calls.length, 3);
});

test("HTTP GitHub client does not follow redirects, sanitize errors, or leak credentials", async () => {
  let captured;
  const data = await githubJson("secret-value", "https://api.github.com/repos/o/r/git/commits/a", {
    fetchFn: async (url, init) => {
      captured = { url, init };
      return Response.json({ sha: hashes.a });
    }
  });
  assert.equal(data.sha, hashes.a);
  assert.equal(captured.init.redirect, "manual");
  assert.equal(captured.init.headers.authorization, "Bearer secret-value");
  await assert.rejects(githubJson("secret-value", "https://attacker.example"), /INVALID_GITHUB_HOST/);
  await assert.rejects(githubJson("secret-value", "https://api.github.com/repos/o/r", {
    fetchFn: async () => new Response("sensitive info", { status: 403 })
  }), /GITHUB_HTTP_403/);
});

test("concurrency failure at reference update is reported and never retried", async () => {
  const { request, calls } = mockGithub({ failedOn: "PATCH" });
  await assert.rejects(relocateDirectory({ ...args, dryRun: false,
    expectedHeadSha: hashes.a, message: "refactor: move frontend"
  }, { token: "fake-oauth-token", request }), /GITHUB_HTTP_422/);
  assert.equal(calls.filter(c => c.method === "PATCH").length, 1);
});
