// Limpeza conservadora de branches de PRs mesclados, sem dependencias de terceiros.
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const apply = process.env.CLEANUP_APPLY === "true";
if (repository !== "joaoldsxyzbr/Assistente-mcps" || !token) {
  throw new Error("Repositorio ou token de GitHub invalidos.");
}
const base = "https://api.github.com/repos/" + repository;
const headers = {
  authorization: "Bearer " + token,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "assistente-mcps-branch-cleanup"
};
async function request(path, method = "GET") {
  const result = await fetch(base + path, { method, headers, redirect: "error" });
  if (method === "DELETE" && result.status === 204) return null;
  if (!result.ok) throw new Error("GitHub " + method + " falhou: HTTP " + result.status);
  return result.json();
}
async function pages(path) {
  const values = [];
  for (let page = 1; page <= 20; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const entries = await request(path + separator + "per_page=100&page=" + page);
    if (!Array.isArray(entries)) throw new Error("Resposta GitHub inesperada");
    values.push(...entries);
    if (entries.length < 100) return values;
  }
  throw new Error("Paginacao incompleta: operacao interrompida");
}
const [branches, closed, opened] = await Promise.all([
  pages("/branches"),
  pages("/pulls?state=closed"),
  pages("/pulls?state=open")
]);
const live = new Set(opened.filter(p => p.head?.repo?.full_name === repository).map(p => p.head.ref));
const merged = new Map();
for (const p of closed) {
  if (!p.merged_at || p.base?.ref !== "main" || p.head?.repo?.full_name !== repository) continue;
  const list = merged.get(p.head.ref) ?? new Set();
  list.add(p.head.sha);
  merged.set(p.head.ref, list);
}
const candidates = branches.filter(b =>
  b.name !== "main" && !b.protected && !live.has(b.name) &&
  merged.get(b.name)?.has(b.commit?.sha)
);
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  branches: branches.length,
  candidates: candidates.length,
  preserved: branches.length - candidates.length,
  candidateNames: candidates.map(b => b.name)
}));
if (candidates.length > 40) throw new Error("Limite de seguranca: mais de 40 branches");
let deleted = 0;
for (const branch of candidates) {
  // Conferir novamente o SHA imediatamente antes da exclusao.
  const ref = "heads/" + branch.name.split("/").map(encodeURIComponent).join("/");
  const current = await request("/git/ref/" + ref);
  if (current.object?.sha !== branch.commit.sha) {
    console.log("Ignorada branch com SHA alterado: " + branch.name);
    continue;
  }
  if (apply) {
    await request("/git/refs/" + ref, "DELETE");
    deleted++;
    console.log("Branch removida: " + branch.name);
  }
}
console.log(JSON.stringify({ complete: true, deleted, mode: apply ? "apply" : "dry-run" }));
