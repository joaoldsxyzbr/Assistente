import ts from "typescript";
import { readdir, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(location);
    else yield location;
  }
}

const originals = [];
for (const folder of ["src", "tests"]) {
  for await (const location of walk(folder)) {
    if (location.endsWith(".ts")) originals.push(location);
  }
}
if (originals.length < 20) throw new Error("Missing expected TypeScript sources");

let migrated = 0;
for (const location of originals) {
  if (location.endsWith(".d.ts") || location === "src/mcps/penpot/tools.ts") {
    await rm(location);
    continue;
  }

  const contents = await readFile(location, "utf8");
  const output = ts.transpileModule(contents, {
    fileName: location,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
      removeComments: false,
    },
  });
  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    throw new Error(location + ": " + errors.map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, " ")).join("; "));
  }

  const destination = location === "tests/penpot-tools.test.ts"
    ? "tests/retired-integrations.test.js"
    : location.slice(0, -3) + ".js";
  // Keep file references in assertions and dynamic imports aligned.
  const javascript = output.outputText.replace(/\.ts\b/g, ".js");
  await writeFile(destination, javascript);
  await rm(location);
  migrated++;
}

await rm("src/types", { recursive: true, force: true });
await rm("src/mcps/penpot", { recursive: true, force: true });
await rm("tsconfig.json");

await mkdir("scripts", { recursive: true });
await writeFile("scripts/check-syntax.mjs", String.raw`import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else if (file.endsWith(".js") || file.endsWith(".mjs")) yield file;
  }
}

let checked = 0;
for (const directory of ["src", "tests", "scripts"]) {
  for await (const file of walk(directory)) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    checked++;
  }
}
console.log("Checked JavaScript syntax in " + checked + " files.");
`);

const pkg = JSON.parse(await readFile("package.json", "utf8"));
pkg.scripts = {
  syntax: "node scripts/check-syntax.mjs",
  test: "node --test tests/*.test.js",
  "build:workers": pkg.scripts["build:workers"],
  check: "npm run syntax && npm test && npm run build:workers",
};
delete pkg.devDependencies.typescript;
delete pkg.devDependencies["@types/node"];
await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");

const wranglerFile = "wrangler.assistente.jsonc";
const wrangler = await readFile(wranglerFile, "utf8");
if (!wrangler.includes('"main": "src/host/worker.ts"')) {
  throw new Error("Unexpected Worker entrypoint");
}
await writeFile(wranglerFile, wrangler.replace(
  '"main": "src/host/worker.ts"',
  '"main": "src/host/worker.js"',
));

const readmeFile = "README.md";
let readme = await readFile(readmeFile, "utf8");
readme = readme.replace(
  /\*\*Compatibilidade com as instruções gerais:\*\*[^\n]+\n/,
  "**Stack atual:** JavaScript nativo (ES Modules), Node.js e Cloudflare Workers. Sem TypeScript, React, Vite ou framework de frontend; SDKs oficiais para os protocolos MCP/OAuth.\n",
);
readme = readme.replaceAll(".ts", ".js");
await writeFile(readmeFile, readme);

const architectureFile = "docs/ARQUITETURA.md";
let architecture = await readFile(architectureFile, "utf8");
architecture = architecture.replace(
  /- \*\*Situação atual:\*\* TypeScript[^\n]*/,
  "- **JavaScript nativo (ES Modules)** para código e testes. Não usamos TypeScript, React, Vite ou framework de frontend; mantemos SDKs oficiais para MCP/OAuth.",
);
architecture = architecture.replaceAll(".ts", ".js");
await writeFile(architectureFile, architecture);

const pkgLock = JSON.parse(await readFile("package-lock.json", "utf8"));
if (!pkgLock.packages) throw new Error("Unexpected lockfile");
console.log("Converted " + migrated + " TypeScript files to native JavaScript.");
