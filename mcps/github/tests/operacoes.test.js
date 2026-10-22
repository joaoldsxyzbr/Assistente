import test from "node:test";
import assert from "node:assert/strict";
import {githubOperations,githubOperationWriteNames,prepareGithubOperation as prepare} from "../tools/operacoes.js";
const r="a".repeat(40),o={owner:"org",repo:"repo"};
test("git operations catalog has schemas closed and write permissions",()=>{
 assert.deepEqual(githubOperationWriteNames,["github_enviar_arquivos","github_integrar_pr","github_excluir_arquivo"]);
 assert.ok(githubOperations.every(t=>t.write&&t.schema.additionalProperties===false));
});
test("push requires confirm, limits count, size, paths and protects main",()=>{
 const a={...o,branch:"feat/branch",message:"Add",files:[{path:"src/file.js",content:"hello"}]};
 assert.throws(()=>prepare("github_enviar_arquivos",a),/CONFIRMATION_REQUIRED/);
 assert.equal(prepare("github_enviar_arquivos",{...a,dryRun:true}).preview,true);
 assert.deepEqual(prepare("github_enviar_arquivos",{...a,confirmar:true}).args.files,a.files);
 assert.throws(()=>prepare("github_enviar_arquivos",{...a,branch:"main",confirmar:true}),/PROTECTED_BRANCH/);
 assert.throws(()=>prepare("github_enviar_arquivos",{...a,files:[{path:"../bad",content:"a"}],confirmar:true}),/FILES_INVALID/);
 assert.throws(()=>prepare("github_enviar_arquivos",{...a,files:Array(9).fill({path:"file",content:"a"}),confirmar:true}),/FILES_INVALID/);
 assert.throws(()=>prepare("github_enviar_arquivos",{...a,files:[{path:"file",content:"a".repeat(140000)}],confirmar:true}),/BATCH_TOO_LARGE/);
});
test("merge requires SHA expected for safe PR workflow",()=>{
 const a={...o,pullNumber:108,expectedHeadSha:r,confirmar:true};
 assert.equal(prepare("github_integrar_pr",a).upstream,"merge_pull_request");
 assert.equal(prepare("github_integrar_pr",a).args.merge_method,"squash");
 assert.throws(()=>prepare("github_integrar_pr",{...a,expectedHeadSha:"bad"}),/PR_GUARD_INVALID/);
});
test("delete only on working branches and requires explicit confirmation",()=>{
 const a={...o,branch:"feat/cleanup",path:"README.md",message:"Clean"};
 assert.throws(()=>prepare("github_excluir_arquivo",a),/CONFIRMATION_REQUIRED/);
 assert.equal(prepare("github_excluir_arquivo",{...a,confirmar:true}).args.path,"README.md");
 assert.throws(()=>prepare("github_excluir_arquivo",{...a,branch:"main",confirmar:true}),/PROTECTED_BRANCH/);
});
