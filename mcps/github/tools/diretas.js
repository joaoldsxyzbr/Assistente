import {readRemoteConfiguration,withRemoteClient} from "../../../server/remote-client.js";
import {invokeRemoteTool,normalizeRemoteResult,remoteFailure} from "../../../server/remote-tools.js";
import {createToolDiagnostics} from "../../../server/shared/tool-diagnostics.js";
import {githubDirectTools,prepareGithubDirectCall} from "./contratos.js";

const fail=message=>({isError:true,content:[{type:"text",text:message}]});
export function registerGithubDirectTools(server,env,fromJsonSchema,securitySchemes,traceId){
  for(const spec of githubDirectTools){
    server.registerTool(spec.name,{
      description:spec.description,
      inputSchema:fromJsonSchema(spec.schema),
      _meta:{securitySchemes:securitySchemes(spec.write)}
    },async(args={})=>{
      const diagnostic=createToolDiagnostics({provider:"github",tool:spec.name,write:spec.write,traceId});
      try{
        const call=prepareGithubDirectCall(spec.name,args);
        diagnostic.stage("oauth");
        const config=await readRemoteConfiguration(env,"github");
        if(!config)return diagnostic.done(fail("[AUTHORIZATION] Conecte o MCP GitHub oficial via OAuth; consulte assistente_status."),{missingAuth:true});
        const raw=await withRemoteClient(config,async client=>
          invokeRemoteTool(client,call.upstream,call.arguments),{onStage:stage=>{ diagnostic.stage(stage); if(stage==="upstream"&&spec.write) diagnostic.markWriteAttempt(); }});
        diagnostic.stage("normalization");
        return diagnostic.done(normalizeRemoteResult(raw));
      }catch(error){
        diagnostic.fail(error);
        return remoteFailure(error,"github");
      }
    });
  }
}