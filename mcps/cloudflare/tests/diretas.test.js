import test from "node:test";
import assert from "node:assert/strict";
import {cloudflareTools,prepareCloudflareCall as prepare} from "../tools/contratos.js";

const id="a".repeat(32);
test("Cloudflare publica somente ferramentas próprias e fechadas",()=>{
 assert.deepEqual(cloudflareTools.map(t=>t.name),[
 "cloudflare_contas","cloudflare_workers","cloudflare_bancos_d1","cloudflare_documentacao"]);
 assert.ok(cloudflareTools.every(t=>!t.write&&t.schema.additionalProperties===false));
});
test("Cloudflare contas usa execute com GET fixo",()=>{
 const a=prepare("cloudflare_contas");
 assert.equal(a.upstream,"execute");
 assert.match(a.arguments.code,/method:"GET"/);
 assert.match(a.arguments.code,/accounts/);
 assert.equal(a.arguments.account_id,undefined);
});
test("Cloudflare Workers e D1 usam conta validada em path fixo",()=>{
 const workers=prepare("cloudflare_workers",{account_id:id});
 assert.equal(workers.arguments.account_id,id);
 assert.match(workers.arguments.code,/workers\/scripts/);
 const d1=prepare("cloudflare_bancos_d1",{account_id:id});
 assert.match(d1.arguments.code,/d1\/database/);
 assert.throws(()=>prepare("cloudflare_workers",{account_id:"other/account"}),/ACCOUNT_INVALID/);
 assert.throws(()=>prepare("cloudflare_workers",{account_id:id,code:"return 1"}),/ARGUMENTS_INVALID/);
});
test("documentação usa consulta tipada, sem parâmetro de execução",()=>{
 const docs=prepare("cloudflare_documentacao",{query:"Workers D1"});
 assert.deepEqual(docs.arguments,{query:"Workers D1"});
 assert.equal(docs.upstream,"docs");
 assert.throws(()=>prepare("cloudflare_documentacao",{query:""}),/QUERY_INVALID/);
});
