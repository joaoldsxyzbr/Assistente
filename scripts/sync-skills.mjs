import { readFile, readdir, writeFile } from "node:fs/promises";

const skillNames = ["ponto", "gastos", "desenvolvimento"];
const contents = Object.fromEntries(
  await Promise.all(
    skillNames.map(async (name) => [
      name,
      await readFile(
        new URL("../skills/" + name + "/SKILL.md", import.meta.url),
        "utf8",
      ),
    ]),
  ),
);
const references = Object.fromEntries(
  await Promise.all(
    skillNames.map(async (name) => {
      const directory = new URL("../skills/" + name + "/", import.meta.url);
      const files = (await readdir(directory))
        .filter((file) => file.endsWith(".md") && file !== "SKILL.md")
        .sort();
      return [
        name,
        Object.fromEntries(
          await Promise.all(
            files.map(async (file) => [
              file,
              await readFile(new URL(file, directory), "utf8"),
            ]),
          ),
        ),
      ];
    }),
  ),
);
const instructions = (
  await readFile(new URL("../skills/INSTRUCTIONS.md", import.meta.url), "utf8")
).trim();
const output = [
  "// Arquivo gerado por npm run skills:sync; edite apenas os arquivos Markdown.",
  "export const SKILL_NAMES = Object.freeze(" +
    JSON.stringify(skillNames) +
    ");",
  "export const SKILL_CONTENTS = Object.freeze(" +
    JSON.stringify(contents, null, 2) +
    ");",
  "export const SKILL_REFERENCES = Object.freeze(" +
    JSON.stringify(references, null, 2) +
    ");",
  "export const MCP_SERVER_INSTRUCTIONS = " +
    JSON.stringify(instructions) +
    ";",
  "",
].join("\n");

const target = new URL("../skills/catalog.js", import.meta.url);
if (process.argv.includes("--check")) {
  const actual = await readFile(target, "utf8");
  if (actual !== output) {
    throw new Error(
      "skills/catalog.js desatualizado; execute npm run skills:sync",
    );
  }
  console.log("Skills e catalogo sincronizados.");
} else {
  await writeFile(target, output);
  console.log("Catalogo de skills gerado.");
}
