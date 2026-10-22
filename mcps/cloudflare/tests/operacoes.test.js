import test from "node:test";
import assert from "node:assert/strict";
import {cloudflareOperationTools as tools,cloudflareOperationWriteNames as writers,
 prepareCloudflareOperation as prepare} from "../tools/operacoes.js";
const account="a".repeat(32),db="11111111-2222-3333-4444-555555555555";
test("D1 consultas/leitura e escritas têm escopos distintos",()=>{
 assert.deepEqual(writers,["cloudflare_d1_executar","cloudflare_worker_publicar_versao"]);
 assert.equal(tools.length,4);
 assert.ok(tools.every(t=>t.schema.additionalProperties===false));
});
test("D1 SELECT usa params e não permite escrita pela rota de leitura",()=>{
 let a=prepare("cloudflare_d1_consultar",{account_id:account,database_id:db,sql:"SELECT * FROM t WHERE id = ?",params:["12"]});
 assert.equal(a.write,false);
 assert.match(a.arguments.code,/"method":"POST"/);
 assert.match(a.arguments.code,/"sql":"SELECT \* FROM t WHERE id = \?"/);
 assert.throws(()=>prepare("cloudflare_d1_consultar",{account_id:account,database_id:db,sql:"DELETE FROM t"}),/READ_COMMAND_REQUIRED/);
 assert.throws(()=>prepare("cloudflare_d1_consultar",{account_id:account,database_id:db,sql:"SELECT 1; DELETE FROM t"}),/SQL_INVALID/);
});
test("D1 escreve somente com confirmar; dryRun não executa remotamente",()=>{
 let args={account_id:account,database_id:db,sql:"UPDATE t SET name = ? WHERE id = ?",params:["ok","2"]};
 assert.throws(()=>prepare("cloudflare_d1_executar",args),/CONFIRMATION_REQUIRED/);
 assert.equal(prepare("cloudflare_d1_executar",{...args,dryRun:true}).preview,true);
 assert.equal(prepare("cloudflare_d1_executar",{...args,confirmar:true}).write,true);
 assert.throws(()=>prepare("cloudflare_d1_executar",{...args,sql:"SELECT 1",confirmar:true}),/WRITE_COMMAND_REQUIRED/);
 assert.throws(()=>prepare("cloudflare_d1_executar",{...args,confirmar:true,extra:1}),/ARGS_INVALID/);
});
test("Workers só aceitam nomes válidos e publicam versão UUID existente",()=>{
 let args={account_id:account,worker:"worker_test",version_id:db};
 assert.equal(prepare("cloudflare_worker_deployments",args).write,false);
 assert.throws(()=>prepare("cloudflare_worker_publicar_versao",args),/CONFIRMATION_REQUIRED/);
 let deployment=prepare("cloudflare_worker_publicar_versao",{...args,confirmar:true});
 assert.match(deployment.arguments.code,/"percentage":100/);
 assert.match(deployment.arguments.code,/"strategy":"percentage"/);
 assert.throws(()=>prepare("cloudflare_worker_deployments",{account_id:account,worker:"bad/name"}),/WORKER_INVALID/);
 assert.throws(()=>prepare("cloudflare_worker_publicar_versao",{...args,version_id:"BAD",confirmar:true}),/VERSION_INVALID/);
});
