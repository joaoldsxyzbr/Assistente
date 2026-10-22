import {readRemoteConfiguration,withRemoteClient} from "../../../server/remote-client.js";
import {invokeRemoteTool,normalizeRemoteResult,remoteFailure} from "../../../server/remote-tools.js";
import {createToolDiagnostics} from "../../../server/shared/tool-diagnostics.js";
import {cloudflareTools,prepareCloudflareCall} from "./contratos.js";

const fail=message=>({isError:true,content:[{type:"text",text:message}]});
export function registerCloudflareTools(server,env,fromJsonSchema,securitySchemes,traceId){
  for(const tool of cloudflareTools){
    server.registerTool(tool.name,{
      description:tool.description,
      inputSchema:fromJsonSchema(tool.schema),
      _meta:{securitySchemes:securitySchemes(false)}
    },async (args={})=>{
      const diagnostic=createToolDiagnostics({provider:"cloudflare",tool:tool.name,write:false,traceId});
      try{
        const call=prepareCloudflareCall(tool.name,args);
        diagnostic.stage("oauth");
        const config=await readRemoteConfiguration(env,"cloudflare");
        if(!config)return diagnostic.done(fail("[AUTHORIZATION] Conecte Cloudflare via OAuth; consulte assistente_status."),{missingAuth:true});
        const raw=await withRemoteClient(config,async client=>
          invokeRemoteTool(client,call.upstream,call.arguments),{onStage:stage=>diagnostic.stage(stage)});
        diagnostic.stage("normalization");
        return diagnostic.done(normalizeRemoteResult(raw));
      }catch(error){
        diagnostic.fail(error);
        return remoteFailure(error,"cloudflare");
      }
    });
  }
}