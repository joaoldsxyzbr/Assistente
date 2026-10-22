// Adaptadores Cloudflare: apenas argumentos tipados entram no script oficial.
const ACCOUNT={type:"string",pattern:"^[0-9a-fA-F]{32}$",minLength:32,maxLength:32};
function make(name,description,properties,required,upstream,map){
  return Object.freeze({name,description,write:false,upstream,
    schema:{type:"object",properties,required,additionalProperties:false},map});
}
const getCode=path=>'async () => { const r = await cloudflare.request({method:"GET",path:'+JSON.stringify(path)+'}); return {success:r.success,result:r.result,result_info:r.result_info}; }';
const byAccount=(path,account_id)=>({code:getCode("/accounts/"+account_id+"/"+path),account_id});
export const cloudflareTools=Object.freeze([
 make("cloudflare_contas","Lista as contas Cloudflare autorizadas pelo OAuth oficial.",
   {},[],"execute",()=>({code:getCode("/accounts")})),
 make("cloudflare_workers","Lista Workers de uma conta Cloudflare; sem expor JavaScript arbitrário.",
   {account_id:ACCOUNT},["account_id"],"execute",a=>byAccount("workers/scripts",a.account_id)),
 make("cloudflare_bancos_d1","Lista bancos D1 da conta Cloudflare, sem executar SQL.",
   {account_id:ACCOUNT},["account_id"],"execute",a=>byAccount("d1/database",a.account_id)),
 make("cloudflare_documentacao","Pesquisa a documentação oficial Cloudflare.",
   {query:{type:"string",minLength:1,maxLength:180}},["query"],"docs",a=>({query:a.query}))
]);
export function prepareCloudflareCall(name,args={}){
  const tool=cloudflareTools.find(t=>t.name===name);
  if(!tool)throw Error("CLOUDFLARE_TOOL_UNKNOWN");
  if(!args||typeof args!=="object"||Array.isArray(args))throw Error("CLOUDFLARE_ARGUMENTS_INVALID");
  for(const field of tool.schema.required){
    if(field==="account_id"&&!/^[0-9a-f]{32}$/i.test(args.account_id??""))throw Error("CLOUDFLARE_ACCOUNT_INVALID");
    if(field==="query"&&(typeof args.query!=="string"||!args.query.trim()||args.query.length>180||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(args.query)))throw Error("CLOUDFLARE_QUERY_INVALID");
  }
  if(Object.keys(args).some(k=>!Object.hasOwn(tool.schema.properties,k)))throw Error("CLOUDFLARE_ARGUMENTS_INVALID");
  return {name:tool.name,upstream:tool.upstream,arguments:tool.map(args),write:false};
}
