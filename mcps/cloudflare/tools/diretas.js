import {readRemoteConfiguration,withRemoteClient} from "../../../server/remote-client.js";
import {invokeRemoteTool,normalizeRemoteResult,remoteFailure} from "../../../server/remote-tools.js";
import {audit} from "../../../server/shared/audit.js";
import {cloudflareTools,prepareCloudflareCall} from "./contratos.js";

const fail=message=>({isError:true,content:[{type:"text",text:message}]});
export function registerCloudflareTools(server,env,fromJsonSchema,securitySchemes,traceId){
  for(const tool of cloudflareTools){
    server.registerTool(tool.name,{
      description:tool.description,
      inputSchema:fromJsonSchema(tool.schema),
      _meta:{securitySchemes:securitySchemes(false)}
    },async (args={})=>{
      const started=Date.now();
      try{
        const call=prepareCloudflareCall(tool.name,args);
        const config=await readRemoteConfiguration(env,"cloudflare");
        if(!config)return fail("[AUTHORIZATION] Conecte Cloudflare via OAuth; consulte assistente_status.");
        const result=await withRemoteClient(config,async client=>
          normalizeRemoteResult(await invokeRemoteTool(client,call.upstream,call.arguments)));
        audit(result.isError?"warn":"info","cloudflare_direct",{
          outcome:result.isError?"error":"ok",tool:call.name,traceId,durationMs:Date.now()-started
        });
        return result;
      }catch(error){
        audit("warn","cloudflare_direct",{outcome:"error",tool:tool.name,traceId,durationMs:Date.now()-started});
        return remoteFailure(error,"cloudflare");
      }
    });
  }
}
