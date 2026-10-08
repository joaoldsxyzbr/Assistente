
export interface GastosToolContract {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isWrite: boolean;
}
const periodo = { type:"string", description:"Mês em MM/AAAA; opcional = próximo mês em America/Sao_Paulo. Aceita atual, anterior e proximo." };
const tipo = { type:"string", enum:["entrada","saida"] };
const status = { type:"string", enum:["pago","pendente"] };
const descricao = { type:"string", minLength:1 };
const valor = { type:"string", minLength:1, description:"Valor em BRL, ex.: 1234,56 ou 1234.56" };
const nullable = { type:["string","null"] };

export const GASTOS_TOOL_CATALOG: readonly GastosToolContract[] = [
 {name:"gastos_resumo",description:"Resumo mensal confirmado: entradas, saídas, saldo e contas pendentes. Padrão próximo mês.",isWrite:false,
 inputSchema:{type:"object",properties:{periodo},additionalProperties:false}},
 {name:"gastos_listar",description:"Lista registros mensais com ID e filtros, sem editar. Padrão próximo mês.",isWrite:false,
 inputSchema:{type:"object",properties:{periodo,tipo,status,categoria:descricao,pagina:{type:"integer",minimum:1,maximum:1000}},additionalProperties:false}},
 {name:"gastos_registrar",description:"Registra uma saída ou entrada. Bloqueia duplicata exata; permitir_duplicado só com confirmação explícita de outra transação.",isWrite:true,
 inputSchema:{type:"object",properties:{periodo,descricao,valor,tipo,status,categoria:nullable,observacao:nullable,permitir_duplicado:{type:"boolean"}},required:["descricao","valor","tipo"],additionalProperties:false}},
 {name:"gastos_atualizar",description:"Atualiza um registro pelo ID ou por busca exata sem ambiguidade, incluindo status pago. Só altera os campos novos enviados.",isWrite:true,
 inputSchema:{type:"object",properties:{periodo,id:{type:"integer",minimum:1},busca:descricao,
 nova_descricao:descricao,novo_valor:valor,novo_tipo:tipo,novo_status:status,nova_categoria:nullable,nova_observacao:nullable},additionalProperties:false}},
 {name:"gastos_excluir",description:"Exclui somente um registro explicitamente solicitado e identificado pelo ID ou descrição inequívoca.",isWrite:true,
 inputSchema:{type:"object",properties:{periodo,id:{type:"integer",minimum:1},descricao},additionalProperties:false}},
];

export interface GastosAction { operacao:string; periodo:string; tabela:string; [key:string]:unknown }
export function resolveGastosPeriodo(raw:unknown, now:Date=new Date()):{periodo:string;tabela:string}|undefined {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",month:"2-digit",year:"numeric"}).formatToParts(now);
  let m=Number(parts.find(p=>p.type==="month")?.value);
  let y=Number(parts.find(p=>p.type==="year")?.value);
  if(typeof raw==="string" && raw.trim()) {
    const p=raw.trim().toLocaleLowerCase("pt-BR");
    if(["proximo","próximo","próximo mês","proximo mes"].includes(p))m++;
    else if(["atual","este mês","este mes"].includes(p)){}
    else if(["anterior","mês passado","mes passado"].includes(p))m--;
    else {const found=/^(\d{1,2})\/(\d{4})$/.exec(p);if(!found)return undefined;m=Number(found[1]);y=Number(found[2]);if(m<1||m>12)return undefined;}
  } else if(raw===undefined||raw===null||raw==="") m++;
  else return undefined;
  if(m===13){m=1;y++} if(m===0){m=12;y--}
  if(m<1||m>12||y<2000||y>2099)return undefined;
  const mm=String(m).padStart(2,"0");
  return {periodo:mm+"/"+y,tabela:"movimentacoes_"+mm+"_"+y};
}
export function moneyToCents(raw:unknown):number|undefined {
  if(typeof raw!=="string")return undefined;
  let x=raw.trim().replace(/^R\$\s*/i,"").trim();
  if(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(x)){}
  else if(/^(?:0|[1-9]\d*)(?:,\d{1,2})?$/.test(x)) x=x.replace(",",".");
  else if(/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?$/.test(x))x=x.replace(/\./g,"").replace(",",".");
  else return undefined;
  const [whole,fraction=""]=x.split(".");
  const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(cents)&&cents>=0?cents:undefined;
}
export const centsToStored=(cents:number):string=>Math.trunc(cents/100)+"."+String(cents%100).padStart(2,"0");
const clean=(v:unknown):string|undefined=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=240?v.trim():undefined;
const optionalText=(v:unknown):string|null|undefined=>v===null?null:clean(v);
const valid=(v:unknown,options:readonly string[]):v is string=>typeof v==="string"&&options.includes(v);
export function prepareGastosAction(tool:string,args:Record<string,unknown>,now:Date=new Date()):{action:GastosAction}|{error:string}{
 const p=resolveGastosPeriodo(args.periodo,now);
 if(!p)return {error:"Período inválido. Use MM/AAAA."};
 const action:GastosAction={operacao:"resumo",...p};
 if(tool==="gastos_resumo")return {action};
 if(tool==="gastos_listar"){
   if(args.tipo!==undefined&&!valid(args.tipo,["entrada","saida"]))return {error:"Tipo inválido."};
   if(args.status!==undefined&&!valid(args.status,["pago","pendente"]))return {error:"Status inválido."};
   if(args.categoria!==undefined&&!clean(args.categoria))return {error:"Categoria inválida."};
   if(args.pagina!==undefined&&(!Number.isInteger(args.pagina)||Number(args.pagina)<1||Number(args.pagina)>1000))return {error:"Página inválida."};
   return {action:{...action,operacao:"listar",tipo:args.tipo,status:args.status,categoria:args.categoria,pagina:args.pagina??1}};
 }
 if(tool==="gastos_registrar"){
   const desc=clean(args.descricao),cents=moneyToCents(args.valor);
   if(!desc||cents===undefined||!valid(args.tipo,["entrada","saida"]))return {error:"Descrição, tipo ou valor inválido."};
   if(args.status!==undefined&&!valid(args.status,["pago","pendente"]))return {error:"Status inválido."};
   const cat=args.categoria===undefined?null:optionalText(args.categoria);
   const obs=args.observacao===undefined?null:optionalText(args.observacao);
   if(cat===undefined||obs===undefined)return {error:"Categoria ou observação inválida."};
   return {action:{...action,operacao:"registrar",descricao:desc,tipo:args.tipo,valor:centsToStored(cents),
     status:args.status??"pendente",categoria:cat,observacao:obs,permitir_duplicado:args.permitir_duplicado===true}};
 }
 if(tool!=="gastos_excluir"&&tool!=="gastos_atualizar")return {error:"Ferramenta desconhecida."};
 if(args.id!==undefined&&(!Number.isSafeInteger(args.id)||Number(args.id)<1))return {error:"ID inválido."};
 const busca=tool==="gastos_excluir"?args.descricao:args.busca;
 if(args.id===undefined&&!clean(busca))return {error:"Informe ID ou descrição exata."};
 action.id=args.id;action.busca=clean(busca);
 if(tool==="gastos_excluir"){action.operacao="excluir";return {action};}
 const changes:Record<string,unknown>={};
 const keys={nova_descricao:"descricao",novo_valor:"valor",novo_tipo:"tipo",novo_status:"status",nova_categoria:"categoria",nova_observacao:"observacao"} as const;
 for(const [key,column] of Object.entries(keys)){
   if(args[key]===undefined)continue;
   if(column==="valor"){const cents=moneyToCents(args[key]);if(cents===undefined)return {error:"Valor inválido."};changes[column]=centsToStored(cents);}
   else if(column==="tipo"||column==="status"){
      if(!valid(args[key],column==="tipo"?["entrada","saida"]:["pago","pendente"]))return {error:"Tipo ou status inválido."};
      changes[column]=args[key];
   }else if(column==="descricao"){const d=clean(args[key]);if(!d)return {error:"Descrição inválida."};changes[column]=d;}
   else {const t=optionalText(args[key]);if(t===undefined)return {error:"Texto inválido."};changes[column]=t;}
 }
 if(Object.keys(changes).length===0)return {error:"Informe alguma alteração."};
 return {action:{...action,operacao:"atualizar",alteracoes:changes}};
}

// Código gerado somente a partir de operações e dados validados no Worker.
// A API Cloudflare é invocada pelo MCP oficial; nenhum binding D1 é criado.
const REMOTE_RUNNER=String.raw`
const query=async(sql,params=[])=>{
  const resp=await cloudflare.request({method:"POST",path:"/accounts/"+accountId+"/d1/database/"+db+"/query",body:{sql,params}});
  const result=Array.isArray(resp.result)?resp.result[0]:undefined;
  if(!result||result.success!==true||!Array.isArray(result.results))throw Error("D1_QUERY_FAILED");
  return result.results;
};
const table=input.tabela;
if(!/^movimentacoes_(0[1-9]|1[0-2])_20\d\d$/.test(table))throw Error("INVALID_TABLE");
const cols="id, descricao, tipo, categoria, valor, status, observacao";
const parse=(raw)=>{
 if(typeof raw!=="string")return null;
 let x=raw.trim().replace(/^R\$\s*/i,"").trim();
 if(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(x)){}
 else if(/^(?:0|[1-9]\d*)(?:,\d{1,2})?$/.test(x))x=x.replace(",",".");
 else if(/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?$/.test(x))x=x.replace(/\./g,"").replace(",",".");
 else return null;
 const parts=x.split(".");
 const cents=Number(parts[0])*100+Number((parts[1]||"").padEnd(2,"0"));
 return Number.isSafeInteger(cents)&&cents>=0?cents:null;
};
const decimal=(c)=>Math.trunc(c/100)+"."+String(c%100).padStart(2,"0");
const normalize=(s)=>String(s).trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR");
const present=(row)=>{const c=parse(row.valor);return {...row,valor_centavos:c,valor_brl:c===null?null:"R$ "+decimal(c).replace(".",",")}};
let exists=await query("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table]);
if(!exists.length&&input.operacao==="registrar"){
 // Criar SOMENTE uma tabela mensal, após verificar a estrutura já persistida.
 const ref=(await query("SELECT name,sql FROM sqlite_master WHERE type='table' AND name GLOB 'movimentacoes_[0-1][0-9]_20[0-9][0-9]' ORDER BY name DESC LIMIT 1"))[0];
 if(!ref||!/^movimentacoes_(0[1-9]|1[0-2])_20\d\d$/.test(ref.name))return {status:"sem_schema",periodo:input.periodo};
 const info=await query("PRAGMA table_info("+ref.name+")");
 if(info.map(x=>x.name).join(",")!=="id,descricao,tipo,categoria,valor,status,observacao")return {status:"schema_incompativel",periodo:input.periodo};
 const idx=await query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",[ref.name]);
 if(idx.length)return {status:"schema_incompativel",periodo:input.periodo};
 const prefix="CREATE TABLE "+ref.name;
 if(typeof ref.sql!=="string"||!ref.sql.startsWith(prefix+" ("))return {status:"schema_incompativel",periodo:input.periodo};
 await query("CREATE TABLE IF NOT EXISTS "+table+ref.sql.slice(prefix.length));
 exists=await query("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table]);
}
if(!exists.length)return {status:"tabela_ausente",periodo:input.periodo};
const all=()=>query("SELECT "+cols+" FROM "+table+" ORDER BY id");
if(input.operacao==="resumo"){
 const rows=await all(),bad=[];
 let entradas=0,saidas=0,pendentes=0;
 for(const row of rows){
   const c=parse(row.valor);
   if(c===null||!["entrada","saida"].includes(row.tipo)||!["pago","pendente"].includes(row.status)){bad.push(row.id);continue;}
   if(row.tipo==="entrada")entradas+=c;
   else{saidas+=c;if(row.status==="pendente")pendentes+=c;}
   if(!Number.isSafeInteger(entradas)||!Number.isSafeInteger(saidas)||!Number.isSafeInteger(pendentes))bad.push(row.id);
 }
 if(bad.length)return {status:"inconsistente",periodo:input.periodo,ids_invalidos:bad};
 const saldo=entradas-saidas;
 return {status:"ok",periodo:input.periodo,quantidade:rows.length,entradas_centavos:entradas,saidas_centavos:saidas,
  saldo_centavos:saldo,pendentes_centavos:pendentes,entradas:decimal(entradas),saidas:decimal(saidas),
  saldo:(saldo<0?"-":"")+decimal(Math.abs(saldo)),pendentes:decimal(pendentes)};
}
if(input.operacao==="listar"){
 const where=[],params=[];
 if(input.tipo){where.push("tipo=?");params.push(input.tipo)}
 if(input.status){where.push("status=?");params.push(input.status)}
 if(input.categoria){where.push("lower(trim(categoria))=?");params.push(normalize(input.categoria))}
 const suffix=" FROM "+table+(where.length?" WHERE "+where.join(" AND "):"");
 const total=(await query("SELECT COUNT(*) AS n"+suffix,params))[0].n;
 const page=input.pagina||1;
 const items=await query("SELECT "+cols+suffix+" ORDER BY id LIMIT 100 OFFSET ?",[...params,(page-1)*100]);
 return {status:"ok",periodo:input.periodo,quantidade:total,pagina:page,mais:page*100<total,items:items.map(present)};
}
if(input.operacao==="registrar"){
 const candidates=[];
 for(const row of await all()){
  if(normalize(row.descricao)!==normalize(input.descricao)||row.tipo!==input.tipo)continue;
  const c=parse(row.valor);
  if(c===null)return {status:"inconsistente",periodo:input.periodo,ids_invalidos:[row.id]};
  if(c===parse(input.valor))candidates.push(present(row));
 }
 if(candidates.length&&!input.permitir_duplicado)return {status:"duplicado",periodo:input.periodo,candidatos:candidates.slice(0,10)};
 const uniqueSql="INSERT INTO "+table+" (descricao,tipo,categoria,valor,status,observacao) "+
  "SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM "+table+" WHERE lower(trim(descricao))=? AND tipo=? AND valor=?) RETURNING "+cols;
 const sql=input.permitir_duplicado?
  "INSERT INTO "+table+" (descricao,tipo,categoria,valor,status,observacao) VALUES (?,?,?,?,?,?) RETURNING "+cols:uniqueSql;
 const params=[input.descricao,input.tipo,input.categoria,input.valor,input.status,input.observacao];
 if(!input.permitir_duplicado)params.push(normalize(input.descricao),input.tipo,input.valor);
 const rows=await query(sql,params);
 return rows.length===1?{status:"registrado",periodo:input.periodo,item:present(rows[0])}:{status:"duplicado",periodo:input.periodo};
}
const found=input.id!==undefined?await query("SELECT "+cols+" FROM "+table+" WHERE id=?",[input.id]):
 (await all()).filter(x=>normalize(x.descricao)===normalize(input.busca));
if(found.length===0)return {status:"nao_encontrado",periodo:input.periodo};
if(found.length!==1)return {status:"ambiguo",periodo:input.periodo,candidatos:found.slice(0,20).map(present)};
const old=found[0],snapshot=[old.id,old.descricao,old.tipo,old.categoria,old.valor,old.status,old.observacao];
const condition=" WHERE id IS ? AND descricao IS ? AND tipo IS ? AND categoria IS ? AND valor IS ? AND status IS ? AND observacao IS ?";
if(input.operacao==="excluir"){
 const rows=await query("DELETE FROM "+table+condition+" RETURNING "+cols,snapshot);
 if(rows.length!==1)return {status:"conflito",periodo:input.periodo};
 const remaining=await query("SELECT id FROM "+table+" WHERE id=?",[old.id]);
 return remaining.length?{status:"nao_confirmado",periodo:input.periodo}:{status:"excluido",periodo:input.periodo,item:present(rows[0])};
}
if(input.operacao==="atualizar"){
 const patch=input.alteracoes;
 const keys=["descricao","tipo","categoria","valor","status","observacao"].filter(key=>
   Object.prototype.hasOwnProperty.call(patch,key)&&patch[key]!==old[key]);
 if(!keys.length)return {status:"sem_alteracao",periodo:input.periodo,item:present(old)};
 const rows=await query("UPDATE "+table+" SET "+keys.map(k=>k+"=?").join(",")+condition+" RETURNING "+cols,
  [...keys.map(k=>patch[k]),...snapshot]);
 return rows.length===1?{status:"atualizado",periodo:input.periodo,item:present(rows[0])}:{status:"conflito",periodo:input.periodo};
}
throw Error("INVALID_OPERATION");
`;
export function buildGastosCode(databaseId:string,action:GastosAction):string{
 return "async () => { const db="+JSON.stringify(databaseId)+"; const input="+JSON.stringify(action)+";\n"+REMOTE_RUNNER+"\n}";
}
