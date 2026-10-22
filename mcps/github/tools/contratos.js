// Adaptadores finos para o MCP oficial do GitHub, sem OAuth ou API REST próprios.
const OWNER = {type:"string",minLength:1,maxLength:100,pattern:"^[A-Za-z0-9-]+$"};
const REPO = {type:"string",minLength:1,maxLength:100,pattern:"^[A-Za-z0-9_.-]+$"};
const str = n => ({type:"string",minLength:1,maxLength:n});
const page = {page:{type:"integer",minimum:1,maximum:10000},perPage:{type:"integer",minimum:1,maximum:100}};
const pg = a => ({page:a.page??1,perPage:a.perPage??20});
const ids = a => ({owner:a.owner,repo:a.repo});
const opt = (a,keys) => Object.fromEntries(keys.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
function def(name,upstream,write,description,extra,required,map){
  return Object.freeze({name,upstream,write,description,schema:{
    type:"object",properties:{owner:OWNER,repo:REPO,...extra},
    required:["owner","repo",...required],additionalProperties:false},map});
}
export const githubDirectTools = Object.freeze([
  def("github_ler_arquivo","get_file_contents",false,
    "Lê arquivo ou pasta no GitHub oficial sem descobrir ferramentas; ref aceita refs/heads/main.",
    {path:str(800),ref:str(250)},["path"],a=>({...ids(a),path:a.path,...opt(a,["ref"])})),
  def("github_estrutura","get_repository_tree",false,
    "Lê árvore de arquivos do repositório; branch ou SHA, filtro de caminho e modo recursivo opcionais.",
    {tree_sha:str(250),recursive:{type:"boolean"},path_filter:str(500)},[],
    a=>({...ids(a),...opt(a,["tree_sha","recursive","path_filter"])})),
  def("github_branches","list_branches",false,
    "Lista branches GitHub paginadas sem buscar catálogo.",
    page,[],a=>({...ids(a),...pg(a)})),
  def("github_commits","list_commits",false,
    "Lista commits com SHA, mensagem e link, em resposta enxuta.",
    {sha:str(250),...page},[],a=>({...ids(a),...pg(a),...opt(a,["sha"]),fields:["sha","commit","html_url"]})),
  def("github_pesquisar_codigo","search_code",false,
    "Busca texto literal dentro de um repositório GitHub, sem pesquisar outros repositórios.",
    {trecho:str(160),...page},["trecho"],
    a=>({query:'"'+a.trecho.trim().replaceAll("\\","\\\\").replaceAll('"','\\"')+'" repo:'+a.owner+'/'+a.repo,
      ...pg(a),fields:["name","path","sha"]})),
  def("github_pull_requests","list_pull_requests",false,
    "Lista pull requests resumidos, abertos, fechados ou todos.",
    {state:{type:"string",enum:["open","closed","all"]},...page},[],
    a=>({...ids(a),...pg(a),state:a.state??"open",
      fields:["number","title","state","draft","html_url","head","base","updated_at"]})),
  def("github_detalhar_pr","pull_request_read",false,
    "Lê detalhes de PR, arquivos alterados, commits ou checagens do CI sem modificar dados.",
    {numero:{type:"integer",minimum:1},detalhe:{type:"string",enum:["get","get_files","get_check_runs","get_commits","get_diff"]},...page},
    ["numero"],a=>({...ids(a),pullNumber:a.numero,method:a.detalhe??"get",...pg(a)})),
  def("github_execucoes_ci","actions_list",false,
    "Consulta execuções de GitHub Actions; permite filtrar por workflow e branch.",
    {workflow:str(250),branch:str(180),...page},[],
    a=>({...ids(a),method:"list_workflow_runs",...pg(a),
      ...(a.workflow?{resource_id:a.workflow}:{}),
      ...(a.branch?{workflow_runs_filter:{branch:a.branch}}:{})})),
  def("github_criar_branch","create_branch",true,
    "Cria uma branch no GitHub oficial, com permissão de escrita; não altera a branch principal.",
    {branch:str(180),from_branch:str(180)},["branch"],
    a=>({...ids(a),branch:a.branch,...opt(a,["from_branch"])})),
  def("github_criar_pr","create_pull_request",true,
    "Abre um pull request pelo MCP oficial GitHub; requer mcp:write e não faz merge.",
    {title:str(220),head:str(180),base:str(180),body:{type:"string",maxLength:10000},draft:{type:"boolean"}},
    ["title","head","base"],
    a=>({...ids(a),title:a.title,head:a.head,base:a.base,...opt(a,["body","draft"])}))
]);
export const githubDirectWriteNames=Object.freeze(githubDirectTools.filter(t=>t.write).map(t=>t.name));
export function prepareGithubDirectCall(name,args){
  const spec=githubDirectTools.find(t=>t.name===name);
  if(!spec) throw Error("GITHUB_TOOL_UNKNOWN");
  if(!args||typeof args!=="object"||Array.isArray(args)||
    !/^[A-Za-z0-9-]{1,100}$/.test(args.owner??"")||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(args.repo??"")) throw Error("GITHUB_REPOSITORY_INVALID");
  for(const field of spec.schema.required) if(args[field]===undefined||args[field]==="")throw Error("GITHUB_REQUIRED_ARGUMENT");
  if(name==="github_pesquisar_codigo"&&
      (typeof args.trecho!=="string"||!args.trecho.trim()||args.trecho.length>160||
      /[\x00-\x1f\x7f]/.test(args.trecho)))throw Error("GITHUB_SEARCH_INVALID");
  if(name==="github_criar_pr"&&args.head===args.base)throw Error("GITHUB_PR_BRANCH_EQUAL");
  return {upstream:spec.upstream,write:spec.write,arguments:spec.map(args)};
}
