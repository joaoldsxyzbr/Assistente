import {readRemoteConfiguration,withRemoteClient} from "../../../server/remote-client.js";
import {invokeRemoteTool,normalizeRemoteResult,remoteFailure} from "../../../server/remote-tools.js";
import {createToolDiagnostics,markCloudflareResultError} from "../../../server/shared/tool-diagnostics.js";

const ACCOUNT={type:"string",pattern:"^[0-9a-fA-F]{32}$",minLength:32,maxLength:32};
const DB={type:"string",pattern:"^[0-9a-fA-F-]{36}$",minLength:36,maxLength:36};
const UUID={type:"string",pattern:"^[0-9a-fA-F-]{36}$",minLength:36,maxLength:36};
const WORKER={type:"string",pattern:"^[A-Za-z0-9_-]{1,63}$",minLength:1,maxLength:63};
const SQL={type:"string",minLength:1,maxLength:5000};
const PARAMS={type:"array",maxItems:50,items:{type:"string",maxLength:2048}};
const CONFIRM={type:"boolean"};
const READ_ARGS={account_id:ACCOUNT,database_id:DB,sql:SQL,params:PARAMS};
const DEPLOY_ARGS={account_id:ACCOUNT,worker:WORKER};
const textResult=text=>({content:[{type:"text",text}]});
function spec(name,description,write,properties,required,build){
 return Object.freeze({name,description,write,schema:{
 type:"object",properties,required,additionalProperties:false
 },build});
}
function requestCode(method,path,body){
 const opts={method,path};
 if(body!==undefined)opts.body=body;
 return 'async () => { const r=await cloudflare.request('+JSON.stringify(opts)+'); return {success:r.success,result:r.result,result_info:r.result_info,errors:r.errors}; }';
}
const d1path=a=>"/accounts/"+a.account_id+"/d1/database/"+a.database_id+"/query";
const workerPath=a=>"/accounts/"+a.account_id+"/workers/scripts/"+a.worker+"/deployments";
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x??"");
const id=x=>/^[0-9a-f]{32}$/i.test(x??"");
const worker=x=>/^[A-Za-z0-9_-]{1,63}$/.test(x??"");
function validateSql(sql,mutation){
 if(typeof sql!=="string"||!sql.trim()||sql.length>5000||/;|--|\/\*|\*\//.test(sql)||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(sql))throw Error("D1_SQL_INVALID");
 const first=sql.trim().match(/^[a-z]+/i)?.[0]?.toUpperCase();
 if(mutation ? !["INSERT","UPDATE","DELETE","REPLACE","CREATE","ALTER","DROP"].includes(first)
             : first!=="SELECT")throw Error(mutation?"D1_WRITE_COMMAND_REQUIRED":"D1_READ_COMMAND_REQUIRED");
}
function validateParams(p){
 if(p===undefined)return [];
 if(!Array.isArray(p)||p.length>50||p.some(x=>typeof x!=="string"||x.length>2048))throw Error("D1_PARAMS_INVALID");
 return p;
}
export const cloudflareOperationTools=Object.freeze([
 spec("cloudflare_d1_consultar","Executa uma consulta SELECT simples e única em D1 por MCP oficial, sem modificar dados.",false,
  READ_ARGS,["account_id","database_id","sql"],a=>({code:requestCode("POST",d1path(a),{sql:a.sql,params:validateParams(a.params)}),account_id:a.account_id})),
 spec("cloudflare_d1_executar","Executa alteração D1 isolada com confirmação explícita. Use dryRun para prévia. Não repita escrita incerta.",true,
  {...READ_ARGS,confirmar:CONFIRM,dryRun:CONFIRM},["account_id","database_id","sql"],a=>({code:requestCode("POST",d1path(a),{sql:a.sql,params:validateParams(a.params)}),account_id:a.account_id})),
 spec("cloudflare_worker_versoes","Lista as versões disponíveis de um Worker pela API oficial.",false,
  DEPLOY_ARGS,["account_id","worker"],a=>({code:requestCode("GET",workerPath(a).replace(/\/deployments$/,"/versions")),account_id:a.account_id})),
 spec("cloudflare_worker_deployments","Lista deploys de um Worker por conta, para diagnóstico e rollback planejado.",false,
  DEPLOY_ARGS,["account_id","worker"],a=>({code:requestCode("GET",workerPath(a)),account_id:a.account_id})),
 spec("cloudflare_worker_publicar_versao","Publica 100% do tráfego em uma versão Worker existente com confirmação e opcional dryRun.",true,
  {...DEPLOY_ARGS,version_id:UUID,confirmar:CONFIRM,dryRun:CONFIRM},
  ["account_id","worker","version_id"],a=>({code:requestCode("POST",workerPath(a),{
   strategy:"percentage",versions:[{version_id:a.version_id,percentage:100}]
  }),account_id:a.account_id}))
]);
export const cloudflareOperationWriteNames=Object.freeze(cloudflareOperationTools.filter(x=>x.write).map(x=>x.name));
export function prepareCloudflareOperation(name,args={}){
 const found=cloudflareOperationTools.find(x=>x.name===name);
 if(!found)throw Error("CLOUDFLARE_TOOL_UNKNOWN");
 if(!args||typeof args!=="object"||Array.isArray(args))throw Error("CLOUDFLARE_ARGS_INVALID");
 if(Object.keys(args).some(k=>!Object.hasOwn(found.schema.properties,k)))throw Error("CLOUDFLARE_ARGS_INVALID");
 if(!id(args.account_id))throw Error("CLOUDFLARE_ACCOUNT_INVALID");
 if("database_id" in found.schema.properties&&!uuid(args.database_id))throw Error("CLOUDFLARE_DATABASE_INVALID");
 if("worker" in found.schema.properties&&!worker(args.worker))throw Error("CLOUDFLARE_WORKER_INVALID");
 if("version_id" in found.schema.properties&&!uuid(args.version_id))throw Error("CLOUDFLARE_VERSION_INVALID");
 if("sql" in found.schema.properties){validateSql(args.sql,found.write);validateParams(args.params);}
 if(found.write){
  if(args.dryRun!==undefined&&typeof args.dryRun!=="boolean")throw Error("CLOUDFLARE_DRY_RUN_INVALID");
  if(args.dryRun!==true&&args.confirmar!==true)throw Error("CLOUDFLARE_CONFIRMATION_REQUIRED");
 }
 return {name:found.name,write:found.write,preview:found.write&&args.dryRun===true,
   arguments:found.build(args)};
}
export function registerCloudflareOperations(server,env,fromJsonSchema,securitySchemes,traceId){
 for(const def of cloudflareOperationTools){
  server.registerTool(def.name,{
   description:def.description,
   inputSchema:fromJsonSchema(def.schema),
   _meta:{securitySchemes:securitySchemes(def.write)}
  },async(args={})=>{
   const diagnostic=createToolDiagnostics({provider:"cloudflare",tool:def.name,write:def.write,traceId});
   try {
    const call=prepareCloudflareOperation(def.name,args);
    if(call.preview)return diagnostic.done(textResult(JSON.stringify({
     dryRun:true,operation:def.name,account_id:args.account_id,
     database_id:args.database_id,worker:args.worker,version_id:args.version_id,
     sql:args.sql,params:args.params
    })),{preview:true});
    diagnostic.stage("oauth");
    const config=await readRemoteConfiguration(env,"cloudflare");
    if(!config)return diagnostic.done({isError:true,content:[{type:"text",text:"[AUTHORIZATION] Conecte Cloudflare via OAuth."}]},{missingAuth:true});
    const raw=await withRemoteClient(config,client=>invokeRemoteTool(client,"execute",call.arguments),
      {onStage:stage=>{
       diagnostic.stage(stage);
       if(stage==="upstream"&&def.write)diagnostic.markWriteAttempt();
      }});
    diagnostic.stage("normalization");
    return diagnostic.done(markCloudflareResultError(normalizeRemoteResult(raw)));
   }catch(error){
    diagnostic.fail(error);
    return remoteFailure(error,"cloudflare");
   }
  });
 }
}