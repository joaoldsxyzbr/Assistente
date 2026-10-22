import test from "node:test";
import assert from "node:assert/strict";
import {
  validateExactEdit, applyExactEdits, decodeGithubText, editGithubFile
} from "../tools/edicao-exata.js";

const sha = Object.fromEntries(["head","tree","folder","old","blob","newTree","newCommit","stale"].map(
  (name, index) => [name, (index + 1).toString(16).repeat(40)]
));
const base = {
  owner: "example", repo: "project", branch: "feature/migration",
  path: "src/app.js", edits: [{ find: "const total = 1;", replace: "const total = 2;" }]
};

function fileContent(content = "const total = 1;\n") {
  const bytes = Buffer.from(content, "utf8");
  return { type: "file", sha: sha.old, encoding: "base64",
    content: bytes.toString("base64"), size: bytes.byteLength };
}

function mockGithub({ content = "const total = 1;\n", fileMode = "100755",
  blobSha = sha.old, headSha = sha.head, failPatch = false, binary = false } = {}) {
  const calls = [];
  const request = async (token, url, config = {}) => {
    assert.equal(token, "mock-token");
    calls.push({ method: config.method ?? "GET", url, body: config.body });
    if (url.includes("/git/ref/heads/")) {
      if (config.method === "PATCH") {
        if (failPatch) throw Error("GITHUB_HTTP_422");
        return { object: { sha: sha.newCommit } };
      }
      return { object: { sha: headSha } };
    }
    if (url.includes("/git/commits/" + sha.head)) return { tree: { sha: sha.tree } };
    if (url.includes("/contents/src/app.js?ref=")) {
      if (binary) return fileContent("binary\0value");
      return { ...fileContent(content), sha: blobSha };
    }
    if (url.endsWith("/git/trees/" + sha.tree)) return { tree: [
      { path: "src", type: "tree", mode: "040000", sha: sha.folder }
    ] };
    if (url.endsWith("/git/trees/" + sha.folder)) return { tree: [
      { path: "app.js", type: "blob", mode: fileMode, sha: sha.old }
    ] };
    if (url.endsWith("/git/blobs") && config.method === "POST") {
      return { sha: sha.blob };
    }
    if (url.endsWith("/git/trees") && config.method === "POST") {
      return { sha: sha.newTree };
    }
    if (url.endsWith("/git/commits") && config.method === "POST") {
      return { sha: sha.newCommit };
    }
    throw Error("Unexpected mock URL");
  };
  return { calls, request };
}

test("accepts only small exact substitutions, work branches and explicit SHA confirmation", () => {
  assert.deepEqual(validateExactEdit(base),
    { branch: "feature/migration", path: "src/app.js", dryRun: true });
  assert.throws(() => validateExactEdit({ ...base, branch: "a/../b" }), /INVALID_BRANCH/);
  assert.throws(() => validateExactEdit({ ...base, path: "../secrets" }), /INVALID_PATH/);
  assert.throws(() => validateExactEdit({ ...base, edits: [] }), /INVALID_EDITS/);
  assert.throws(() => validateExactEdit({ ...base,
    edits: [{ find: "x", replace: "x" }] }), /INVALID_EDITS/);
  assert.throws(() => validateExactEdit({ ...base,
    edits: [{ find: "a".repeat(26000), replace: "b" }] }), /EDIT_TOO_LARGE/);
  assert.throws(() => validateExactEdit({ ...base, dryRun: false }), /EXPECTED_SHA_REQUIRED/);
  assert.throws(() => validateExactEdit({ ...base, dryRun: false, branch: "main",
    expectedHeadSha: sha.head, expectedBlobSha: sha.old,
    message: "Update original file" }), /PROTECTED_BRANCH/);
});

test("replacements require unique exact context and preserve surrounding lines", () => {
  const source = "const total = 1;\nconst other = 3;\n";
  assert.equal(applyExactEdits(source, base.edits),
    "const total = 2;\nconst other = 3;\n");
  assert.throws(() => applyExactEdits(source, [{ find: "unknown", replace: "x" }]),
    /FIND_NOT_FOUND/);
  assert.throws(() => applyExactEdits("x\nx", [{ find: "x", replace: "y" }]),
    /FIND_AMBIGUOUS/);
  assert.equal(applyExactEdits("café\r\n", [{ find: "café", replace: "maçã" }]), "maçã\r\n");
  assert.equal(applyExactEdits("foo", [
    { find: "foo", replace: "bar" },
    { find: "bar", replace: "baz" }
  ]), "baz");
});

test("decode only verified UTF-8 GitHub files, rejecting binary and inconsistent bytes", () => {
  assert.equal(decodeGithubText(fileContent("olá!\n")), "olá!\n");
  assert.throws(() => decodeGithubText(fileContent("test\0hi")), /UNSUPPORTED_BINARY_FILE/);
  assert.throws(() => decodeGithubText({ ...fileContent("text"), type: "symlink" }),
    /UNSUPPORTED_FILE/);
  assert.throws(() => decodeGithubText({ ...fileContent("text"), size: 1 }),
    /INVALID_FILE_SIZE/);
  assert.throws(() => decodeGithubText({ ...fileContent("x"), content: "@@@@" }),
    /INVALID_FILE_ENCODING/);
  const invalid = Buffer.from([0xff, 0xfe]).toString("base64");
  assert.throws(() => decodeGithubText({
    ...fileContent("xx"), content: invalid
  }), /UNSUPPORTED_BINARY_FILE/);
});

test("preview fetches immutable commit and file; never writes or returns source", async () => {
  const mock = mockGithub();
  const result = await editGithubFile(base, { token: "mock-token", request: mock.request });
  assert.deepEqual(Object.keys(result).sort(),
    ["blobSha","branch","dryRun","edits","headSha","originalBytes",
      "path","status","updatedBytes"].sort());
  assert.equal(result.status, "preview");
  assert.equal(result.headSha, sha.head);
  assert.equal(result.blobSha, sha.old);
  assert.equal(result.edits, 1);
  assert.equal(mock.calls.length, 5);
  assert.ok(mock.calls.every(call => call.method === "GET"));
  assert.ok(!JSON.stringify(result).includes("const total"));
});

test("commit is atomic and preserves executable bit, without transmitting entire original file through MCP", async () => {
  const mock = mockGithub({ fileMode: "100755" });
  const result = await editGithubFile({
    ...base, dryRun: false, expectedHeadSha: sha.head,
    expectedBlobSha: sha.old, message: "fix: update app safely"
  }, { token: "mock-token", request: mock.request });
  assert.equal(result.status, "committed");
  assert.equal(result.commitSha, sha.newCommit);
  assert.deepEqual(mock.calls.map(call => call.method),
    ["GET","GET","GET","GET","GET","POST","POST","POST","PATCH"]);
  const blob = mock.calls.find(call => call.url.endsWith("/git/blobs"));
  assert.deepEqual(blob.body, { content: "const total = 2;\n", encoding: "utf-8" });
  const tree = mock.calls.find(call => call.url.endsWith("/git/trees"));
  assert.equal(tree.body.tree[0].mode, "100755");
  assert.equal(tree.body.tree[0].path, "src/app.js");
  const update = mock.calls.at(-1);
  assert.deepEqual(update.body, { sha: sha.newCommit, force: false });
});

test("stale branch or blob, symlink and ambiguous context never create a commit", async () => {
  const write = { ...base, dryRun: false, expectedHeadSha: sha.head,
    expectedBlobSha: sha.old, message: "fix: update app safely" };
  const stale = mockGithub();
  await assert.rejects(editGithubFile({ ...write, expectedHeadSha: sha.stale },
    { token: "mock-token", request: stale.request }), /STALE_HEAD/);
  assert.equal(stale.calls.length, 1);
  const blob = mockGithub({ blobSha: sha.stale });
  await assert.rejects(editGithubFile(write, { token: "mock-token", request: blob.request }),
    /UNSUPPORTED_FILE|STALE_BLOB/);
  assert.ok(blob.calls.every(c => c.method === "GET"));
  const symlink = mockGithub({ fileMode: "120000" });
  await assert.rejects(editGithubFile(write, { token: "mock-token", request: symlink.request }),
    /UNSUPPORTED_FILE/);
  assert.ok(symlink.calls.every(c => c.method === "GET"));
  const ambiguous = mockGithub({ content: "const total = 1;\nconst total = 1;\n" });
  await assert.rejects(editGithubFile(write,
    { token: "mock-token", request: ambiguous.request }), /FIND_AMBIGUOUS/);
  assert.ok(ambiguous.calls.every(c => c.method === "GET"));
});

test("errors after creating a commit are not retried or reported as confirmed", async () => {
  const mock = mockGithub({ failPatch: true });
  await assert.rejects(editGithubFile({ ...base, dryRun: false,
    expectedHeadSha: sha.head, expectedBlobSha: sha.old,
    message: "fix: update app safely"
  }, { token: "mock-token", request: mock.request }), /GITHUB_HTTP_422/);
  assert.equal(mock.calls.filter(x => x.method === "PATCH").length, 1);
});