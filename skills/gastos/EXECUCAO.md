# Execução de referência — skill Gastos

Esta referência preserva a lógica validada anteriormente em `mcps/gastos/tools.js`, mas **não é servidor MCP nem ferramenta implantada**. O ChatGPT usa o MCP oficial Cloudflare diretamente.

- `account_id`: `924f32dc9eeb8946dc033801c0c17c42`
- `database_id`: `0c6c31c2-f2fd-4f60-9c75-b232019ae63f`
- Endpoint usado pelo código: `POST /accounts/{account_id}/d1/database/{database_id}/query`.
- **Valide a entrada antes de montar `input`:** `operacao` em `resumo`, `listar`, `registrar`, `atualizar`, `excluir`; `tabela` = `movimentacoes_MM_AAAA` derivada do período em America/Sao_Paulo (próximo mês como padrão). Não aceite nomes de tabela arbitrários do usuário.
- Descrição deve ser curta, não vazia; `tipo` apenas `entrada` ou `saida`; `status` apenas `pago` ou `pendente`.
- Valores em reais: normalize formato brasileiro e converta para centavos inteiros com no máximo duas casas; armazene como decimal TEXT `1234.56`. Nunca arredondar valores inválidos.
- `registrar` requer `descricao`, `tipo`, `valor`, `status`, `categoria` e `observacao`; `permitir_duplicado` só após confirmação explícita de transação distinta.
- `listar`: filtros opcionais `tipo`, `status`, `categoria`, `pagina` (1 a 1000).
- `atualizar`/`excluir`: `id` inteiro positivo ou `busca` inequívoca. `atualizar` recebe apenas `alteracoes` permitidas; confirmar resultado e conflitos.
- **Não execute** em D1 real para testar. Consultas não criam tabelas; criação de mês ocorre apenas na primeira escrita autorizada.

## Utilização com Cloudflare MCP

Passe à ferramenta oficial Cloudflare `execute` os parâmetros `account_id` acima e `code` conforme o formato abaixo, substituindo `input` por dados validados. O corpo seguinte é a rotina histórica testada, mantida como referência:

```js
async () => {
  const db = "0c6c31c2-f2fd-4f60-9c75-b232019ae63f";
  const input = { operacao: "resumo", periodo: "11/2026", tabela: "movimentacoes_11_2026" };

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
const normalizedDescriptionSql=(()=>{
 let expr="lower(descricao)";
 for(const [upper,lower] of [["Á","á"],["À","à"],["Â","â"],["Ã","ã"],["É","é"],["Ê","ê"],["Í","í"],["Ó","ó"],["Ô","ô"],["Õ","õ"],["Ú","ú"],["Ü","ü"],["Ç","ç"]]) {
   expr="replace("+expr+",'"+upper+"','"+lower+"')";
 }
 for(const whitespace of ["\\u00a0","\\t","\\n","\\r"]) {
   expr="replace("+expr+",'"+whitespace+"',' ')";
 }
 for(let i=0;i<8;i++)expr="replace("+expr+",'  ',' ')";
 return "trim("+expr+")";
})();
const present=(row)=>{const c=parse(row.valor);return {...row,valor_centavos:c,valor_brl:c===null?null:"R$ "+decimal(c).replace(".",",")}};
let exists=await query("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table]);
if(!exists.length&&input.operacao==="registrar"){
 // Criar SOMENTE uma tabela mensal, após verificar a estrutura já persistida.
 const ref=(await query("SELECT name,sql FROM sqlite_master WHERE type='table' AND name GLOB 'movimentacoes_[0-1][0-9]_20[0-9][0-9]' ORDER BY substr(name,18,4) DESC, substr(name,15,2) DESC LIMIT 1"))[0];
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
  "SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM "+table+" WHERE "+normalizedDescriptionSql+"=? AND tipo=? AND valor=?) RETURNING "+cols;
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
}
```

Nota: o objeto `input` acima é **somente um exemplo**, não deve determinar o período real de uma solicitação. Antes de qualquer escrita, confira a conexão OAuth e o ID do banco. Erros depois do início de uma escrita exigem consulta de conciliação.
