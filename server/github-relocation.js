import { getUpstreamAccessToken } from "./upstream-oauth.js";
import { audit } from "./shared/audit.js";

const MAX_FILES = 250;
const HASH = /^[0-9a-f]{40}$/i;
const VALID_NAME = /^[a-zA-Z0-9_.-]{1,100}$/;
const VALID_BRANCH = /^[a-zA-Z0-9_./-]{1,180}$/;

function safePath(value) {
  if (typeof value !== "string" || value.length > 300) return false;
  const parts = value.split("/");
  return parts.length <= 24 && parts.every(part =>
    part.length > 0 && part !== "." && part !== ".." &&
    !/[\\\x00-\x1f\x7f]/.test(part));
}
export function validateRelocation(input) {
  if (!VALID_NAME.test(input?.owner ?? "") || !VALID_NAME.test(input?.repo ?? ""))
    throw Error("INVALID_REPOSITORY");
  const branch = input?.branch;
  if (typeof branch !== "string" || !VALID_BRANCH.test(branch) ||
      branch.startsWith("/") || branch.endsWith("/") ||
      branch.includes("//") || branch.includes("..") || branch.includes("@{"))
    throw Error("INVALID_BRANCH");
  const from = input?.from;
  const to = input?.to;
  if (!safePath(from) || !safePath(to) || from === to ||
      from.startsWith(to + "/") || to.startsWith(from + "/"))
    throw Error("INVALID_DIRECTORY");
  const mode = input.mode ?? "copy";
  if (mode !== "copy" && mode !== "move") throw Error("INVALID_MODE");
  if (input.dryRun === false) {
    if (branch === "main" || branch === "master") throw Error("PROTECTED_BRANCH");
    if (!HASH.test(input.expectedHeadSha ?? "")) throw Error("EXPECTED_SHA_REQUIRED");
    if (typeof input.message !== "string" || input.message.trim().length < 8 ||
        input.message.length > 180) throw Error("INVALID_COMMIT_MESSAGE");
  }
  return { from, to, branch, mode, dryRun: input.dryRun !== false };
}

export function planDirectoryRelocation(entries, from, to, mode = "copy") {
  if (!Array.isArray(entries)) throw Error("INVALID_TREE");
  if (!safePath(from) || !safePath(to) || from === to ||
      from.startsWith(to + "/") || to.startsWith(from + "/"))
    throw Error("INVALID_DIRECTORY");
  if (!["copy", "move"].includes(mode)) throw Error("INVALID_MODE");
  const blobs = entries.filter(item => item?.type === "blob");
  const all = new Map(entries.map(item => [item.path, item]));
  const source = blobs.filter(item => item.path?.startsWith(from + "/"));
  const submodules = entries.filter(item =>
    item.type === "commit" && item.path?.startsWith(from + "/"));
  if (submodules.length) throw Error("UNSUPPORTED_SUBMODULE");
  if (!source.length) throw Error("SOURCE_EMPTY");
  if (source.length > MAX_FILES) throw Error("TOO_MANY_FILES");
  const changes = [];
  const preview = [];
  let alreadyCopied = 0;
  for (const item of source) {
    const destination = to + item.path.slice(from.length);
    if (!safePath(destination) || !HASH.test(item.sha ?? "") ||
        !["100644", "100755", "120000"].includes(item.mode))
      throw Error("UNSUPPORTED_SOURCE");
    const existing = all.get(destination);
    if (existing) {
      if (existing.type !== "blob" || existing.sha !== item.sha ||
          existing.mode !== item.mode) throw Error("DESTINATION_CONFLICT");
      alreadyCopied += 1;
    } else {
      changes.push({ path: destination, mode: item.mode, type: "blob", sha: item.sha });
    }
    if (mode === "move") {
      changes.push({ path: item.path, mode: item.mode, type: "blob", sha: null });
    }
    if (preview.length < 25) preview.push({ from: item.path, to: destination });
  }
  return {
    sourceFiles: source.length,
    copied: source.length - alreadyCopied,
    alreadyCopied,
    removed: mode === "move" ? source.length : 0,
    changes,
    preview
  };
}

function apiPath(owner, repo, suffix) {
  return "https://api.github.com/repos/" +
    encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + suffix;
}
export async function githubJson(token, url, { method = "GET", body, fetchFn = fetch } = {}) {
  if (!url.startsWith("https://api.github.com/repos/"))
    throw Error("INVALID_GITHUB_HOST");
  const response = await fetchFn(url, {
    method, redirect: "manual", signal: AbortSignal.timeout(20000),
    headers: {
      authorization: "Bearer " + token,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "assistente-mcps",
      "x-github-api-version": "2026-03-10"
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw Error("GITHUB_HTTP_" + response.status);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 8 * 1024 * 1024) throw Error("GITHUB_RESPONSE_TOO_LARGE");
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw Error("GITHUB_RESPONSE_TOO_LARGE");
  try { return JSON.parse(text); } catch { throw Error("INVALID_GITHUB_RESPONSE"); }
}

export async function relocateDirectory(input, {
  token,
  request = githubJson
}) {
  const { from, to, branch, mode, dryRun } = validateRelocation(input);
  if (!token) throw Error("GITHUB_NOT_CONNECTED");
  const base = apiPath(input.owner, input.repo, "");
  const refUrl = base + "/git/ref/heads/" +
    branch.split("/").map(encodeURIComponent).join("/");
  const ref = await request(token, refUrl);
  const headSha = ref?.object?.sha;
  if (!HASH.test(headSha ?? "")) throw Error("INVALID_HEAD");
  if (!dryRun && headSha !== input.expectedHeadSha) throw Error("STALE_HEAD");

  const commit = await request(token, base + "/git/commits/" + headSha);
  if (!HASH.test(commit?.tree?.sha ?? "")) throw Error("INVALID_BASE_TREE");
  const tree = await request(token, base + "/git/trees/" + commit.tree.sha + "?recursive=1");
  if (tree.truncated === true) throw Error("TRUNCATED_TREE");
  const plan = planDirectoryRelocation(tree.tree, from, to, mode);
  const summary = {
    branch, headSha, mode, dryRun, from, to,
    sourceFiles: plan.sourceFiles, copied: plan.copied,
    alreadyCopied: plan.alreadyCopied, removed: plan.removed,
    preview: plan.preview,
    previewTruncated: plan.sourceFiles > plan.preview.length
  };
  if (dryRun || plan.changes.length === 0)
    return { ...summary, status: dryRun ? "preview" : "already_synced" };

  const createdTree = await request(token, base + "/git/trees", {
    method: "POST", body: { base_tree: commit.tree.sha, tree: plan.changes }
  });
  if (!HASH.test(createdTree?.sha ?? "")) throw Error("INVALID_CREATED_TREE");
  const next = await request(token, base + "/git/commits", {
    method: "POST", body: {
      message: input.message.trim(), tree: createdTree.sha, parents: [headSha]
    }
  });
  if (!HASH.test(next?.sha ?? "")) throw Error("INVALID_CREATED_COMMIT");
  await request(token, refUrl, {
    method: "PATCH", body: { sha: next.sha, force: false }
  });
  return { ...summary, status: "committed", dryRun: false, commitSha: next.sha };
}

export function registerGithubRelocation(server, env, fromJsonSchema, securitySchemes, traceId) {
  server.registerTool("github_relocate_directory", {
    description: "Copia ou move uma pasta inteira na branch do GitHub reutilizando blobs existentes, SEM transferir codigo via chat. Primeiro dryRun=true para obter headSha; para executar use dryRun=false e expectedHeadSha da previa. Nao grava na main, nao sobrescreve destinos diferentes e nao edita imports.",
    inputSchema: fromJsonSchema({
      type: "object",
      properties: {
        owner: { type: "string", minLength: 1, maxLength: 100 },
        repo: { type: "string", minLength: 1, maxLength: 100 },
        branch: { type: "string", minLength: 1, maxLength: 180 },
        from: { type: "string", minLength: 1, maxLength: 300 },
        to: { type: "string", minLength: 1, maxLength: 300 },
        mode: { type: "string", enum: ["copy", "move"], default: "copy" },
        dryRun: { type: "boolean", default: true },
        expectedHeadSha: { type: "string", minLength: 40, maxLength: 40 },
        message: { type: "string", minLength: 8, maxLength: 180 }
      },
      required: ["owner", "repo", "branch", "from", "to"],
      additionalProperties: false
    }),
    _meta: { securitySchemes: securitySchemes(true) }
  }, async args => {
    const started = Date.now();
    try {
      const token = await getUpstreamAccessToken(env, "github");
      const result = await relocateDirectory(args, { token });
      audit("info", "github_relocation", {
        server: "github", traceId, outcome: result.status,
        fileCount: result.sourceFiles,
        durationMs: Date.now() - started
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      const category = String(error?.message ?? "UNCONFIRMED");
      const allowed = new Set([
        "INVALID_REPOSITORY", "INVALID_BRANCH", "INVALID_DIRECTORY", "INVALID_MODE",
        "PROTECTED_BRANCH", "EXPECTED_SHA_REQUIRED", "INVALID_COMMIT_MESSAGE",
        "INVALID_TREE", "UNSUPPORTED_SUBMODULE", "SOURCE_EMPTY", "TOO_MANY_FILES",
        "UNSUPPORTED_SOURCE", "DESTINATION_CONFLICT", "GITHUB_NOT_CONNECTED",
        "INVALID_HEAD", "STALE_HEAD", "INVALID_BASE_TREE", "TRUNCATED_TREE",
        "INVALID_CREATED_TREE", "INVALID_CREATED_COMMIT", "GITHUB_RESPONSE_TOO_LARGE",
        "INVALID_GITHUB_RESPONSE"
      ]);
      const safe = allowed.has(category) ? category
        : /^GITHUB_HTTP_(400|401|403|404|409|422|429|500|502|503|504)$/.test(category)
          ? category : "UNCONFIRMED";
      audit("warn", "github_relocation", {
        server: "github", traceId, outcome: "error",
        category: safe, durationMs: Date.now() - started
      });
      return {
        isError: true,
        content: [{ type: "text", text: "[" + safe + "] Nao houve confirmacao de commit. " +
          "Em operacao de escrita, consulte a branch no GitHub antes de repetir." }]
      };
    }
  });
}