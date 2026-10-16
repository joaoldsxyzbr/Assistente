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
test("worker publica duas skills, estado e quatro endpoints remotos",async()=>{
 const worker=await read("server/worker.js");
 assert.match(worker,/assistente_status/);
 assert.match(worker,/assistente_skill/);
 assert.match(worker,/registerRemoteTools/);
 assert.deepEqual(remoteToolNames,["mcp_github_call","mcp_cloudflare_call"]);
 assert.equal((worker.match(/server\.registerTool\(/g)||[]).length,2);
});
test("identidades upstream HTTPS imutáveis, segredos fora de status",()=>{
 assert.equal(endpointFor("github"),"https://api.githubcopilot.com/mcp/");
 assert.equal(endpointFor("cloudflare"),"https://mcp.cloudflare.com/mcp");
 assert.equal(endpointFor("unknown"),null);
 assert.equal(readRemoteConfiguration({},"github"),null);
 assert.deepEqual(readRemoteConfiguration({GITHUB_OAUTH_ACCESS_TOKEN:" example "},"github"),{id:"github",endpoint:endpointFor("github"),token:"example"});
});
test("bancos D1 permanecem distintos e corretos",async()=>{
 const config=JSON.parse(await read("wrangler.assistente.jsonc"));
 const ids=["PONTO_D1_DATABASE_ID","GASTOS_D1_DATABASE_ID"].map(k=>config.vars[k]);
 assert.notEqual(ids[0],ids[1]);
 assert.ok(SKILL_CONTENTS.ponto.includes(ids[0]));
 assert.ok(SKILL_CONTENTS.gastos.includes(ids[1]));
});
test("desenvolvimento mantém requisitos de qualidade",()=>{
 for(const term of ["RED → GREEN → REFACTOR","causa raiz","CI","produção"])assert.ok(SKILL_CONTENTS.desenvolvimento.includes(term));
});
