import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else if (file.endsWith(".js") || file.endsWith(".mjs")) yield file;
  }
}
let count = 0;
for (const directory of ["mcps", "server", "tests", "scripts"]) {
  for await (const file of walk(directory)) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    count++;
  }
}
console.log("Checked JavaScript syntax in " + count + " files.");

