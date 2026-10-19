import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { SKILL_NAMES, SKILL_CONTENTS, MCP_SERVER_INSTRUCTIONS } from "../skills/catalog.js";
import { endpointFor, readRemoteConfiguration } from "../server/remote-client.js";
import { remoteToolNames } from "../server/remote-tools.js";
const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");

test("skills correspondem ao Markdown",async()=>{
 assert.deepEqual(SKILL_NAMES,["ponto","gastos","desenvolvimento"]);
 for(const name of SKILL_NAMES)assert.equal(SKILL_CONTENTS[name],await read("skills/"+name+"/SKILL.md"));
 assert.equal(MCP_SERVER_INSTRUCTIONS,(await read("skills/INSTRUCTIONS.md")).trim());
});
test("worker publica skills, estado, MCPs oficiais e relocacao GitHub",async()=>{
 const worker=await read("server/mcp-server.js");
 assert.match(worker,/assistente_status/);
 assert.match(worker,/assistente_skill/);
 assert.match(worker,/registerRemoteTools/);
 assert.match(worker,/registerGithubRelocation/);
 assert.match(worker,/registerGithubExactEdit/);
 assert.deepEqual(remoteToolNames,["mcp_github_call","mcp_cloudflare_call","github_relocate_directory","github_edit_file"]);
 assert.equal((worker.match(/server\.registerTool\(/g)||[]).length,2);
});
test("endpoints oficiais fixos e configuração OAuth lida do KV",async()=>{
 assert.equal(endpointFor("github"),"https://api.githubcopilot.com/mcp/x/all");
 assert.equal(endpointFor("cloudflare"),"https://mcp.cloudflare.com/mcp");
 assert.equal(endpointFor("unknown"),null);
 assert.equal(await readRemoteConfiguration({},"github"),null);
});
test("bancos D1 permanecem distintos e corretos",async()=>{
 const config=JSON.parse(await read("wrangler.assistente.jsonc"));
 const ids=["PONTO_D1_DATABASE_ID","GASTOS_D1_DATABASE_ID"].map(k=>config.vars[k]);
 assert.notEqual(ids[0],ids[1]);
 assert.ok(SKILL_CONTENTS.ponto.includes(ids[0]));
 assert.ok(SKILL_CONTENTS.gastos.includes(ids[1]));
 assert.equal(config.env, undefined);
 assert.equal(config.previews, undefined);
 assert.equal(config.workers_dev, false);
 assert.equal(config.preview_urls, false);
 assert.equal(config.kv_namespaces[0].binding, "OAUTH_KV");
});
test("skills Ponto e Gastos encaminham ao Cloudflare oficial pelo Worker sem duplicar ferramentas",()=>{
 assert.ok(SKILL_CONTENTS.ponto.includes("mcp_cloudflare_call"));
 assert.ok(SKILL_CONTENTS.gastos.includes("mcp_cloudflare_call"));
 assert.ok(SKILL_CONTENTS.ponto.includes("não há binding D1"));
});
test("desenvolvimento mantém requisitos de qualidade",()=>{
 for(const term of ["RED → GREEN → REFACTOR","causa raiz","CI","produção"])assert.ok(SKILL_CONTENTS.desenvolvimento.includes(term));
});