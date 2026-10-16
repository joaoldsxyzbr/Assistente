import { hasValidOAuthPassword } from "./shared/oauth-helpers.js";

const ORIGIN = "https://assistente.joaolds.xyz.br";
const PREFIX = "assistente:upstream:v1:";
const PROVIDERS = ["github", "cloudflare"];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unbase64url(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s)) throw Error("INVALID_KEY");
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function randomString() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
async function encryptionKey(env) {
  const bytes = unbase64url(env.UPSTREAM_OAUTH_ENCRYPTION_KEY || "");
  if (bytes.length !== 32) throw Error("ENCRYPTION_KEY_UNCONFIGURED");
  return crypto.subtle.importKey("raw", bytes, {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
}
async function sealed(env, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const content = await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(env),encoder.encode(JSON.stringify(data)));
  return base64url(iv) + "." + base64url(new Uint8Array(content));
}
async function unseal(env, value) {
  const parts = typeof value === "string" ? value.split(".") : [];
  if (parts.length !== 2) throw Error("INVALID_RECORD");
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:unbase64url(parts[0])},await encryptionKey(env),unbase64url(parts[1]));
  return JSON.parse(decoder.decode(plain));
}
function storage(env) {
  if (!env.OAUTH_KV || typeof env.OAUTH_KV.get !== "function") throw Error("KV_UNCONFIGURED");
  return env.OAUTH_KV;
}
async function readSealed(env,key) {
  const value = await storage(env).get(PREFIX+key);
  if (!value) return null;
  return unseal(env,value);
}
async function writeSealed(env,key,value,ttl) {
  const opts = ttl ? {expirationTtl:ttl} : undefined;
  await storage(env).put(PREFIX+key,await sealed(env,value),opts);
}
function validateCloudflareUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !(url.hostname === "cloudflare.com" || url.hostname.endsWith(".cloudflare.com"))) throw Error("UNTRUSTED_OAUTH_ENDPOINT");
  return url.href;
}
function callback(provider) {
  return ORIGIN+"/connections/"+provider+"/callback";
}
function githubOptions(env) {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) throw Error("GITHUB_OAUTH_APP_NOT_CONFIGURED");
  return {client_id:env.GITHUB_OAUTH_CLIENT_ID,client_secret:env.GITHUB_OAUTH_CLIENT_SECRET,
    authorization_endpoint:"https://github.com/login/oauth/authorize",
    token_endpoint:"https://github.com/login/oauth/access_token",
    scope:"repo read:org read:user workflow offline_access"};
}
async function cfMetadata(fetchFn) {
  const resourceUrl="https://mcp.cloudflare.com/.well-known/oauth-protected-resource/mcp";
  const res=await fetchFn(resourceUrl,{headers:{accept:"application/json"},redirect:"error"});
  if (!res.ok) throw Error("CLOUDFLARE_RESOURCE_METADATA_UNAVAILABLE");
  const resource=await res.json();
  if (!Array.isArray(resource.authorization_servers) || !resource.authorization_servers.length) throw Error("CLOUDFLARE_AUTH_SERVER_MISSING");
  const issuer=validateCloudflareUrl(resource.authorization_servers[0]);
  const parsed=new URL(issuer);
  const path=parsed.pathname.replace(/\/$/,"");
  const url=parsed.origin+"/.well-known/oauth-authorization-server"+path;
  let response=await fetchFn(url,{headers:{accept:"application/json"},redirect:"error"});
  if (!response.ok && path) response=await fetchFn(parsed.origin+"/.well-known/oauth-authorization-server",{headers:{accept:"application/json"},redirect:"error"});
  if (!response.ok) throw Error("CLOUDFLARE_OAUTH_METADATA_UNAVAILABLE");
  const metadata=await response.json();
  for (const key of ["authorization_endpoint","token_endpoint","registration_endpoint"]) {
    if (!metadata[key]) throw Error("CLOUDFLARE_OAUTH_METADATA_INCOMPLETE");
    metadata[key]=validateCloudflareUrl(metadata[key]);
  }
  return metadata;
}
async function cfOptions(env,fetchFn) {
  const meta=await cfMetadata(fetchFn);
  let client=await readSealed(env,"client:cloudflare");
  if (!client || client.registration_endpoint !== meta.registration_endpoint) {
    const response=await fetchFn(meta.registration_endpoint,{
      method:"POST",redirect:"error",headers:{"content-type":"application/json",accept:"application/json"},
      body:JSON.stringify({client_name:"Assistente MCPs",redirect_uris:[callback("cloudflare")],
        grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"none"})
    });
    if (!response.ok) throw Error("CLOUDFLARE_CLIENT_REGISTRATION_FAILED");
    const registration=await response.json();
    if (typeof registration.client_id !== "string" || !registration.client_id) throw Error("CLOUDFLARE_CLIENT_REGISTRATION_INVALID");
    client={client_id:registration.client_id,client_secret:registration.client_secret ?? "",
      registration_endpoint:meta.registration_endpoint};
    await writeSealed(env,"client:cloudflare",client);
  }
  return {...client,authorization_endpoint:meta.authorization_endpoint,token_endpoint:meta.token_endpoint,scope:""};
}
async function optionsFor(env,provider,fetchFn) {
  if (provider === "github") return githubOptions(env);
  if (provider === "cloudflare") return cfOptions(env,fetchFn);
  throw Error("PROVIDER_UNKNOWN");
}
function form(provider, action) {
  const label=provider==="github"?"GitHub":"Cloudflare";
  return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Autorizar '+label+'</title>'+
    '<h1>Conectar '+label+' ao Assistente MCPs</h1><p>Esta autorização é independente do login do ChatGPT.</p>'+
    '<form method="post" action="/connections/'+provider+'/'+action+'">'+
    '<label>Senha do Assistente <input type="password" name="password" required autocomplete="current-password"></label>'+
    '<button type="submit">'+(action==="start"?"Autorizar":"Desconectar")+'</button></form></html>';
}
function html(text,status=200) {
  return new Response(text,{status,headers:{"content-type":"text/html; charset=utf-8",
    "cache-control":"no-store","referrer-policy":"no-referrer",
    "content-security-policy":"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
function errorResponse() {
  return html("Não foi possível concluir a conexão OAuth. Confira a configuração e inicie uma nova autorização.",503);
}
async function start(provider,env,fetchFn) {
  const conf=await optionsFor(env,provider,fetchFn);
  const state=randomString();
  const verifier=randomString();
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(verifier)));
  const url=new URL(conf.authorization_endpoint);
  url.searchParams.set("client_id",conf.client_id);
  url.searchParams.set("redirect_uri",callback(provider));
  url.searchParams.set("response_type","code");
  url.searchParams.set("state",state);
  url.searchParams.set("code_challenge",base64url(digest));
  url.searchParams.set("code_challenge_method","S256");
  if (conf.scope) url.searchParams.set("scope",conf.scope);
  if (provider==="cloudflare") url.searchParams.set("resource","https://mcp.cloudflare.com/mcp");
  await writeSealed(env,"state:"+state,{provider,verifier,client_id:conf.client_id,
    client_secret:conf.client_secret ?? "",token_endpoint:conf.token_endpoint},600);
  return Response.redirect(url.href,302);
}
async function exchange(env,provider,state,code,fetchFn) {
  if (typeof state !== "string" || state.length > 128 || typeof code !== "string" || !code || code.length>2048) return html("Estado OAuth inválido.",400);
  const saved=await readSealed(env,"state:"+state);
  if (!saved || saved.provider!==provider) return html("Sessão de autorização expirada.",400);
  await storage(env).delete(PREFIX+"state:"+state);
  const formBody=new URLSearchParams({
    grant_type:"authorization_code",client_id:saved.client_id,code,
    code_verifier:saved.verifier,redirect_uri:callback(provider)
  });
  if (saved.client_secret) formBody.set("client_secret",saved.client_secret);
  if (provider==="cloudflare") formBody.set("resource","https://mcp.cloudflare.com/mcp");
  const res=await fetchFn(saved.token_endpoint,{method:"POST",redirect:"error",
    headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},
    body:formBody.toString()});
  if (!res.ok) return errorResponse();
  const data=await res.json();
  if (typeof data.access_token !== "string" || !data.access_token || (data.token_type && data.token_type.toLowerCase()!=="bearer")) return errorResponse();
  if (provider==="github") {
    const me=await fetchFn("https://api.github.com/user",{headers:{authorization:"Bearer "+data.access_token,"user-agent":"assistente-mcps","accept":"application/vnd.github+json"},redirect:"error"});
    if (!me.ok || (await me.json()).login !== "joaoldsxyzbr") return html("Conta GitHub diferente da autorizada para este projeto.",403);
  }
  await writeSealed(env,"token:"+provider,{
    access_token:data.access_token,refresh_token:data.refresh_token || null,
    expires_at:Number.isFinite(data.expires_in)?Date.now()+data.expires_in*1000:null,
    client_id:saved.client_id,client_secret:saved.client_secret,
    token_endpoint:saved.token_endpoint
  });
  return html("Conexão OAuth com "+provider+" autorizada. Volte ao ChatGPT e atualize o Assistente MCPs.");
}
async function refreshedToken(env,provider,current,fetchFn) {
  if (current.expires_at===null || current.expires_at>Date.now()+60000) return current.access_token;
  if (!current.refresh_token) return null;
  const body=new URLSearchParams({grant_type:"refresh_token",client_id:current.client_id,refresh_token:current.refresh_token});
  if (current.client_secret) body.set("client_secret",current.client_secret);
  if (provider==="cloudflare") body.set("resource","https://mcp.cloudflare.com/mcp");
  try {
    const res=await fetchFn(current.token_endpoint,{method:"POST",redirect:"error",
      headers:{"content-type":"application/x-www-form-urlencoded",accept:"application/json"},body:body.toString()});
    if (!res.ok) return null;
    const data=await res.json();
    if (typeof data.access_token!=="string" || !data.access_token) return null;
    const updated={...current,access_token:data.access_token,
      refresh_token:data.refresh_token || current.refresh_token,
      expires_at:Number.isFinite(data.expires_in)?Date.now()+data.expires_in*1000:null};
    await writeSealed(env,"token:"+provider,updated);
    return updated.access_token;
  } catch {return null;}
}
export async function getUpstreamAccessToken(env,provider,fetchFn=fetch) {
  if (!PROVIDERS.includes(provider)) return null;
  try {
    const data=await readSealed(env,"token:"+provider);
    if (!data) return null;
    return refreshedToken(env,provider,data,fetchFn);
  } catch {return null;}
}
export async function hasUpstreamConnection(env,provider) {
  if (!PROVIDERS.includes(provider)) return false;
  try { const token=await readSealed(env,"token:"+provider);return !!token?.access_token && (token.expires_at===null || token.expires_at>Date.now() || !!token.refresh_token); }
  catch {return false;}
}
export async function handleUpstreamRoutes(request,env,fetchFn=fetch) {
  const url=new URL(request.url);
  const match=/^\/connections\/(github|cloudflare)\/(start|callback|disconnect)$/.exec(url.pathname);
  if (!match) return undefined;
  const [,provider,operation]=match;
  if (operation==="callback") {
    if (request.method!=="GET") return new Response("Method not allowed",{status:405});
    if (url.searchParams.has("error")) return html("Autorização recusada no provedor.",400);
    try {return await exchange(env,provider,url.searchParams.get("state"),url.searchParams.get("code"),fetchFn);}
    catch {return errorResponse();}
  }
  if (request.method==="GET") return html(form(provider,operation));
  if (request.method!=="POST") return new Response("Method not allowed",{status:405});
  try {
    const body=await request.formData();
    if (!hasValidOAuthPassword(env.ASSISTENTE_OAUTH_PASSWORD,body.get("password"))) return html("Senha incorreta.",401);
    if (operation==="disconnect") {
      await storage(env).delete(PREFIX+"token:"+provider);
      return html("Conexão local desconectada. Para revogar o token no provedor, use as configurações de acesso da conta.");
    }
    return await start(provider,env,fetchFn);
  } catch {return errorResponse();}
}
