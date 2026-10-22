import {readRemoteConfiguration,withRemoteClient} from "../../../server/remote-client.js";
import {invokeRemoteTool,normalizeRemoteResult,remoteFailure} from "../../../server/remote-tools.js";
import {audit} from "../../../server/shared/audit.js";
import {githubDirectTools,prepareGithubDirectCall} from "./contratos.js";

const fail=message=>({isError:true,content:[{type:"text",text:message}]});
export function registerGithubDirectTools(server,env,fromJsonSchema,securitySchemes,traceId){
  for(const spec of githubDirectTools){
    server.registerTool(spec.name,{
      description:spec.description,
      inputSchema:fromJsonSchema(spec.schema),
      _meta:{securitySchemes:securitySchemes(spec.write)}
    },async(args={})=>{
      const started=Date.now();
      try{
        const call=prepareGithubDirectCall(spec.name,args);
        const config=await readRemoteConfiguration(env,"github");
        if(!config)return fail("[AUTHORIZATION] Conecte o MCP GitHub oficial via OAuth; consulte assistente_status.");
        const result=await withRemoteClient(config,async client=>
          normalizeRemoteResult(await invokeRemoteTool(client,call.upstream,call.arguments)));
        audit(result.isError?"warn":"info","github_direct",{
          outcome:result.isError?"error":"ok",tool:spec.name,traceId,durationMs:Date.now()-started});
        return result;
      }catch(error){
        audit("warn","github_direct",{outcome:"error",tool:spec.name,traceId,durationMs:Date.now()-started});
        return remoteFailure(error,"github");
      }
    });
  }
}
