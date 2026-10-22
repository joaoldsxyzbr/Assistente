import test from "node:test";
import assert from "node:assert/strict";
import { githubDirectTools, githubDirectWriteNames, prepareGithubDirectCall as call } from "../tools/contratos.js";

test("10 ferramentas distintas, com schemas fechados e escopos corretos",()=>{
  assert.equal(githubDirectTools.length,10);
  assert.equal(new Set(githubDirectTools.map(x=>x.name)).size,10);
  for(const d of githubDirectTools){
    assert.ok(d.description.length>20 && d.name.startsWith("github_"));
    assert.equal(d.schema.additionalProperties,false);
  }
  assert.deepEqual(githubDirectWriteNames,["github_criar_branch","github_criar_pr"]);
});
test("arquivos, estrutura, branches e commits mapeiam corretamente",()=>{
  assert.deepEqual(call("github_ler_arquivo",{owner:"o",repo:"r",path:"README.md",ref:"refs/heads/main"}).arguments,
    {owner:"o",repo:"r",path:"README.md",ref:"refs/heads/main"});
  assert.equal(call("github_estrutura",{owner:"o",repo:"r",recursive:true}).upstream,"get_repository_tree");
  assert.equal(call("github_branches",{owner:"o",repo:"r"}).arguments.perPage,20);
  assert.deepEqual(call("github_commits",{owner:"o",repo:"r"}).arguments.fields,["sha","commit","html_url"]);
});
test("busca por código fica confinada ao repositório",()=>{
  assert.equal(call("github_pesquisar_codigo",{owner:"o",repo:"r",trecho:"fetch"}).arguments.query,'"fetch" repo:o/r');
  assert.throws(()=>call("github_pesquisar_codigo",{owner:"o",repo:"r",trecho:"fetch\nrepo:other/r"}),/SEARCH_INVALID/);
  assert.throws(()=>call("github_pesquisar_codigo",{owner:"o/r",repo:"r",trecho:"fetch"}),/REPOSITORY_INVALID/);
});
test("detalhamento de PR e consultas CI não fazem escrita",()=>{
  assert.deepEqual(call("github_detalhar_pr",{owner:"o",repo:"r",numero:106,detalhe:"get_check_runs"}).arguments,
    {owner:"o",repo:"r",pullNumber:106,method:"get_check_runs",page:1,perPage:20});
  let ci=call("github_execucoes_ci",{owner:"o",repo:"r",workflow:"ci.yml",branch:"main"});
  assert.equal(ci.upstream,"actions_list");
  assert.equal(ci.arguments.resource_id,"ci.yml");
  assert.deepEqual(ci.arguments.workflow_runs_filter,{branch:"main"});
  assert.equal(ci.write,false);
});
test("criar branch/PR exige escrita; não permite PR para mesma branch",()=>{
  assert.equal(call("github_criar_branch",{owner:"o",repo:"r",branch:"feat/a"}).write,true);
  let pr=call("github_criar_pr",{owner:"o",repo:"r",head:"feat/a",base:"main",title:"Novo PR"});
  assert.equal(pr.upstream,"create_pull_request");
  assert.equal(pr.write,true);
  assert.throws(()=>call("github_criar_pr",{owner:"o",repo:"r",head:"main",base:"main",title:"erro"}),/PR_BRANCH_EQUAL/);
  assert.throws(()=>call("github_nao_existe",{owner:"o",repo:"r"}),/TOOL_UNKNOWN/);
});
