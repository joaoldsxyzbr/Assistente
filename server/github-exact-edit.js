import { getUpstreamAccessToken } from "./upstream-oauth.js";
import { audit } from "./shared/audit.js";
import { githubJson } from "./github-relocation.js";

const HASH = /^[0-9a-f]{40}$/i;
const REPO = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9_./-]{1,180}$/;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_EDIT_BYTES = 24 * 1024;
const MAX_EDITS = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function validPath(value) {
  return typeof value === "string" && value.length <= 300 &&
    value.split("/").every(segment => segment.length > 0 &&
      segment !== "." && segment !== ".." &&
      !/[\\\x00-\x1f\x7f]/.test(segment));
}

export function validateExactEdit(input) {
  if (!REPO.test(input?.owner ?? "") || !REPO.test(input?.repo ?? ""))
    throw Error("INVALID_REPOSITORY");
  const branch = input.branch;
  if (typeof branch !== "string" || !BRANCH.test(branch) ||
      branch.startsWith("/") || branch.endsWith("/") ||
      branch.includes("//") || branch.includes("..") || branch.includes("@{"))
    throw Error("INVALID_BRANCH");
  if (!validPath(input.path)) throw Error("INVALID_PATH");
  if (!Array.isArray(input.edits) || !input.edits.length ||
      input.edits.length > MAX_EDITS) throw Error("INVALID_EDITS");
  if (encoder.encode(JSON.stringify(input.edits)).byteLength > MAX_EDIT_BYTES)
    throw Error("EDIT_TOO_LARGE");
  for (const edit of input.edits) {
    if (!edit || typeof edit.find !== "string" || !edit.find.length ||
        typeof edit.replace !== "string" || edit.find === edit.replace)
      throw Error("INVALID_EDITS");
  }
  const dryRun = input.dryRun !== false;
  if (!dryRun) {
    if (branch === "main" || branch === "master") throw Error("PROTECTED_BRANCH");
    if (!HASH.test(input.expectedHeadSha ?? "") ||
        !HASH.test(input.expectedBlobSha ?? "")) throw Error("EXPECTED_SHA_REQUIRED");
    if (typeof input.message !== "string" || input.message.trim().length < 8 ||
        input.message.length > 180) throw Error("INVALID_COMMIT_MESSAGE");
  }
  return { branch, path: input.path, dryRun };
}

export function applyExactEdits(original, edits) {
  let result = original;
  for (const { find, replace } of edits) {
    const first = result.indexOf(find);
    if (first < 0) throw Error("FIND_NOT_FOUND");
    if (result.indexOf(find, first + find.length) >= 0) throw Error("FIND_AMBIGUOUS");
    result = result.slice(0, first) + replace + result.slice(first + find.length);
    if (encoder.encode(result).byteLength > MAX_FILE_BYTES)
      throw Error("FILE_TOO_LARGE");
  }
  return result;
}

export function decodeGithubText(file) {
  if (!file || file.type !== "file" || !HASH.test(file.sha ?? "") ||
      file.encoding !== "base64" || typeof file.content !== "string")
    throw Error("UNSUPPORTED_FILE");
  if (!Number.isSafeInteger(file.size) || file.size < 0 ||
      file.size > MAX_FILE_BYTES || file.content.length > 750000)
    throw Error("FILE_TOO_LARGE");
  let bytes;
  try {
    const base64 = file.content.replace(/\s/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw Error();
    const raw = atob(base64);
    bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  } catch { throw Error("INVALID_FILE_ENCODING"); }
  if (bytes.length !== file.size || bytes.length > MAX_FILE_BYTES)
    throw Error("INVALID_FILE_SIZE");
  let decoded;
  try { decoded = decoder.decode(bytes); }
  catch { throw Error("UNSUPPORTED_BINARY_FILE"); }
  if (decoded.includes("\0")) throw Error("UNSUPPORTED_BINARY_FILE");
  return decoded;
}

function repositoryUrl(owner, repo) {
  return "https://api.github.com/repos/" +
    encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
}

export async function editGithubFile(input, { token, request = githubJson } = {}) {
  const { branch, path, dryRun } = validateExactEdit(input);
  if (!token) throw Error("GITHUB_NOT_CONNECTED");
  const base = repositoryUrl(input.owner, input.repo);
  const refUrl = base + "/git/ref/heads/" +
    branch.split("/").map(encodeURIComponent).join("/");
  const ref = await request(token, refUrl);
  const headSha = ref?.object?.sha;
  if (!HASH.test(headSha ?? "")) throw Error("INVALID_HEAD");
  if (!dryRun && input.expectedHeadSha !== headSha)
    throw Error("STALE_HEAD");

  const commit = await request(token, base + "/git/commits/" + headSha);
  if (!HASH.test(commit?.tree?.sha ?? "")) throw Error("INVALID_BASE_TREE");

  // Read by immutable commit hash, never a mutable branch name.
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const file = await request(token, base + "/contents/" + encodedPath + "?ref=" + headSha);
  // Inspect the immutable tree to retain executable bits and reject symlinks/submodules.
  let treeSha = commit.tree.sha;
  let fileMode;
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    const level = await request(token, base + "/git/trees/" + treeSha);
    if (!Array.isArray(level?.tree) || level.truncated) throw Error("INVALID_FILE_TREE");
    const entry = level.tree.find(item => item.path === parts[index]);
    if (!entry) throw Error("FILE_NOT_IN_TREE");
    if (index < parts.length - 1) {
      if (entry.type !== "tree" || !HASH.test(entry.sha ?? ""))
        throw Error("UNSUPPORTED_FILE");
      treeSha = entry.sha;
    } else {
      if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode) ||
          entry.sha !== file?.sha) throw Error("UNSUPPORTED_FILE");
      fileMode = entry.mode;
    }
  }
  const original = decodeGithubText(file);
  if (!dryRun && file.sha !== input.expectedBlobSha)
    throw Error("STALE_BLOB");
  const updated = applyExactEdits(original, input.edits);
  const originalBytes = encoder.encode(original).byteLength;
  const updatedBytes = encoder.encode(updated).byteLength;
  if (updatedBytes > MAX_FILE_BYTES) throw Error("FILE_TOO_LARGE");

  const summary = {
    status: "preview", dryRun, branch, path, headSha,
    blobSha: file.sha, edits: input.edits.length,
    originalBytes, updatedBytes
  };
  if (dryRun) return summary;

  const blob = await request(token, base + "/git/blobs", {
    method: "POST", body: { content: updated, encoding: "utf-8" }
  });
  if (!HASH.test(blob?.sha ?? "")) throw Error("INVALID_CREATED_BLOB");
  const tree = await request(token, base + "/git/trees", {
    method: "POST", body: {
      base_tree: commit.tree.sha,
      tree: [{ path, mode: fileMode, type: "blob", sha: blob.sha }]
    }
  });
  if (!HASH.test(tree?.sha ?? "")) throw Error("INVALID_CREATED_TREE");
  const created = await request(token, base + "/git/commits", {
    method: "POST",
    body: { message: input.message.trim(), tree: tree.sha, parents: [headSha] }
  });
  if (!HASH.test(created?.sha ?? "")) throw Error("INVALID_CREATED_COMMIT");
  const patch = await request(token, refUrl, {
    method: "PATCH", body: { sha: created.sha, force: false }
  });
  if (patch?.object?.sha !== created.sha) throw Error("COMMIT_UNCONFIRMED");
  return { ...summary, status: "committed", dryRun: false, commitSha: created.sha };
}

const allowedErrors = new Set([
  "INVALID_REPOSITORY", "INVALID_BRANCH", "INVALID_PATH", "INVALID_EDITS",
  "EDIT_TOO_LARGE", "PROTECTED_BRANCH", "EXPECTED_SHA_REQUIRED",
  "INVALID_COMMIT_MESSAGE", "FIND_NOT_FOUND", "FIND_AMBIGUOUS",
  "FILE_TOO_LARGE", "UNSUPPORTED_FILE", "INVALID_FILE_ENCODING",
  "INVALID_FILE_SIZE", "UNSUPPORTED_BINARY_FILE", "GITHUB_NOT_CONNECTED",
  "INVALID_HEAD", "STALE_HEAD", "INVALID_BASE_TREE", "STALE_BLOB",
  "INVALID_CREATED_BLOB", "INVALID_CREATED_TREE", "INVALID_CREATED_COMMIT",
  "COMMIT_UNCONFIRMED", "INVALID_FILE_TREE", "FILE_NOT_IN_TREE"
]);

export function registerGithubExactEdit(server, env, fromJsonSchema, securitySchemes, traceId) {
  server.registerTool("github_edit_file", {
    description: "Edita um arquivo textual existente no GitHub por substituicoes EXATAS e unicas, sem transferir o arquivo inteiro no chat. Primeiro dryRun=true para obter headSha/blobSha; executar somente com dryRun=false, expectedHeadSha, expectedBlobSha e message. Somente branch de trabalho, sem retries e sem exposicao do conteudo nos logs.",
    inputSchema: fromJsonSchema({
      type: "object",
      properties: {
        owner: { type: "string", minLength: 1, maxLength: 100 },
        repo: { type: "string", minLength: 1, maxLength: 100 },
        branch: { type: "string", minLength: 1, maxLength: 180 },
        path: { type: "string", minLength: 1, maxLength: 300 },
        edits: { type: "array", minItems: 1, maxItems: MAX_EDITS, items: {
          type: "object",
          properties: {
            find: { type: "string", minLength: 1 },
            replace: { type: "string" }
          },
          required: ["find", "replace"],
          additionalProperties: false
        } },
        dryRun: { type: "boolean", default: true },
        expectedHeadSha: { type: "string", minLength: 40, maxLength: 40 },
        expectedBlobSha: { type: "string", minLength: 40, maxLength: 40 },
        message: { type: "string", minLength: 8, maxLength: 180 }
      },
      required: ["owner", "repo", "branch", "path", "edits"],
      additionalProperties: false
    }),
    _meta: { securitySchemes: securitySchemes(true) }
  }, async args => {
    const start = Date.now();
    try {
      const token = await getUpstreamAccessToken(env, "github");
      const result = await editGithubFile(args, { token });
      audit("info", "github_exact_edit", {
        traceId, server: "github", outcome: result.status,
        durationMs: Date.now() - start, bytes: result.updatedBytes
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      const raw = String(error?.message ?? "");
      const category = allowedErrors.has(raw) ? raw
        : /^GITHUB_HTTP_(400|401|403|404|409|422|429|500|502|503|504)$/.test(raw)
          ? raw : "UNCONFIRMED";
      audit("warn", "github_exact_edit", {
        traceId, server: "github", outcome: "error",
        category, durationMs: Date.now() - start
      });
      return { isError: true, content: [{
        type: "text",
        text: "[" + category + "] Edicao nao confirmada. Se era escrita, consulte a branch antes de repetir."
      }] };
    }
  });
}