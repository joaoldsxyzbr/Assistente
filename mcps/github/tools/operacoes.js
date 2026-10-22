import {readRemoteConfiguration,withRemoteClient} from "../../../server/remote-client.js";
import {invokeRemoteTool,normalizeRemoteResult,remoteFailure} from "../../../server/remote-tools.js";
import {createToolDiagnostics} from "../../../server/shared/tool-diagnostics.js";
import {remoteCallMetrics,remoteCallTimeout} from "../../../server/shared/batch-policy.js";
const OWNER={type:"string",minLength:1,maxLength:100,pattern:"^[A-Za-z0-9-]+$"};
const REPO={type:"string",minLength:1,maxLength:100,pattern:"^[A-Za-z0-9_.-]+$"};
const NAME={type:"string",minLength:1,maxLength:200};
const REFSHA={type:"string",pattern:"^[0-9a-fA-F]{40}$",minLength:40,maxLength:40};
const BOOL={type:"boolean"};
const IDS={owner:OWNER,repo:REPO};
function spec(name,description,upstream,properties,required,build){
 return Object.freeze({name,description,write:true,upstream,
 schema:{type:"object",properties:{...IDS,...properties,confirmar:BOOL,dryRun:BOOL},
 required:["owner","repo",...required],additionalProperties:false},build});
}
const fields={path:{type:"string",minLength:1,maxLength:500},content:{type:"string",maxLength:128*1024}};
export const githubOperations=Object.freeze([
 spec("github_enviar_arquivos","Adiciona ou modifica até 8 arquivos em um commit de branch não principal. Confirmação requerida e dryRun disponível.",
  "push_files",{branch:NAME,files:{type:"array",minItems:1,maxItems:8,items:{
   type:"object",properties:fields,required:["path","content"],additionalProperties:false
  }},message:NAME},["branch","files","message"],
  a=>({owner:a.owner,repo:a.repo,branch:a.branch,files:a.files,message:a.message})),
 spec("github_integrar_pr","Faz merge de um PR com SHA esperado para impedir integrar uma revisão inesperada. Requer confirmação explícita.",
  "merge_pull_request",{pullNumber:{type:"integer",minimum:1},expectedHeadSha:REFSHA,
    merge_method:{type:"string",enum:["squash","merge","rebase"]}},
  ["pullNumber","expectedHeadSha"],
  a=>({owner:a.owner,repo:a.repo,pullNumber:a.pullNumber,expectedHeadSha:a.expectedHeadSha,
   merge_method:a.merge_method??"squash"})),
 spec("github_excluir_arquivo","Remove arquivo em uma branch de trabalho, nunca diretamente na main/master. Confirmação obrigatória.",
  "delete_file",{branch:NAME,path:fields.path,message:NAME},["branch","path","message"],
  a=>({owner:a.owner,repo:a.repo,branch:a.branch,path:a.path,message:a.message}))
]);
export const githubOperationWriteNames=Object.freeze(githubOperations.map(x=>x.name));
const pathOK=p=>typeof p==="string"&&p.length>0&&p.length<=500&&
 !p.startsWith("/")&&!p.endsWith("/")&&!p.split("/").some(s=>s===""||s==="."||s==="..");
export function prepareGithubOperation(name,args={}){
 const tool=githubOperations.find(t=>t.name===name);
 if(!tool)throw Error("GITHUB_TOOL_UNKNOWN");
 if(!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(tool.schema.properties,k)))
  throw Error("GITHUB_ARGUMENT_INVALID");
 if(!/^[A-Za-z0-9-]{1,100}$/.test(args.owner??"")||!/^[A-Za-z0-9_.-]{1,100}$/.test(args.repo??""))
  throw Error("GITHUB_REPOSITORY_INVALID");
 for(const field of tool.schema.required)if(args[field]===undefined||args[field]===null||args[field]==="")
  throw Error("GITHUB_REQUIRED_ARGUMENT");
 if(args.dryRun!==undefined&&typeof args.dryRun!=="boolean")throw Error("GITHUB_DRYRUN_INVALID");
 if(args.dryRun!==true&&args.confirmar!==true)throw Error("GITHUB_CONFIRMATION_REQUIRED");
 if(name!=="github_integrar_pr"&&(!/^[A-Za-z0-9_.\/-]{1,200}$/.test(args.branch??"")||
    ["main","master"].includes(args.branch?.toLowerCase())))throw Error("GITHUB_PROTECTED_BRANCH");
 if(name==="github_enviar_arquivos"){
  if(!Array.isArray(args.files)||args.files.length<1||args.files.length>8)throw Error("GITHUB_FILES_INVALID");
  for(const f of args.files)if(!f||Object.keys(f).some(k=>!["path","content"].includes(k))||
      !pathOK(f.path)||typeof f.content!=="string")throw Error("GITHUB_FILES_INVALID");
  const batch=remoteCallMetrics("github","push_files",{files:args.files});
  if(batch.tooLarge)throw Error("GITHUB_BATCH_TOO_LARGE");
 }
 if(name==="github_excluir_arquivo"&&!pathOK(args.path))throw Error("GITHUB_PATH_INVALID");
 if(name==="github_integrar_pr"&&(!Number.isInteger(args.pullNumber)||args.pullNumber<1||
   !/^[a-f0-9]{40}$/i.test(args.expectedHeadSha??"")))throw Error("GITHUB_PR_GUARD_INVALID");
 return {name:tool.name,upstream:tool.upstream,args:tool.build(args),preview:args.dryRun===true};
}
export function registerGithubOperations(server,env,fromJsonSchema,securitySchemes,traceId){
 for(const tool of githubOperations){
  server.registerTool(tool.name,{
   description:tool.description,inputSchema:fromJsonSchema(tool.schema),
   _meta:{securitySchemes:securitySchemes(true)}
  },async(args={})=>{
   const diagnostic=createToolDiagnostics({provider:"github",tool:tool.name,write:true,traceId});
   try {
    const call=prepareGithubOperation(tool.name,args);
    if(call.preview)return diagnostic.done({content:[{type:"text",text:JSON.stringify({
     dryRun:true,operation:tool.name,owner:args.owner,repo:args.repo,
     branch:args.branch,paths:args.files?.map(f=>f.path),
     path:args.path,pullNumber:args.pullNumber,expectedHeadSha:args.expectedHeadSha
    })}]},{preview:true});
    diagnostic.stage("oauth");
    const config=await readRemoteConfiguration(env,"github");
    if(!config)return diagnostic.done({isError:true,content:[{type:"text",text:"[AUTHORIZATION] Conecte GitHub via OAuth."}]},{missingAuth:true});
    const timeoutMs=remoteCallTimeout("github",call.upstream);
    const raw=await withRemoteClient(config,client=>invokeRemoteTool(client,call.upstream,call.args,timeoutMs),
      {callTimeoutMs:timeoutMs,onStage:stage=>{
       diagnostic.stage(stage);
       if(stage==="upstream")diagnostic.markWriteAttempt();
      }});
    diagnostic.stage("normalization");
    return diagnostic.done(normalizeRemoteResult(raw));
   } catch(error) {
    diagnostic.fail(error);
    return remoteFailure(error,"github");
   }
  });
 }
}