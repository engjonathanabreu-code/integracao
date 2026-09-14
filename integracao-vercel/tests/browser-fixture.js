// Development-only harness. Never included in the production entry point.
import {fixture} from './fixture.js';
const base=fixture();base.meta_arquivos=[];base.erp_exclusoes_chat=[];base.documentos=[];
const original=window.fetch.bind(window);let writes=0;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin===location.origin || url.protocol==='data:')return original(input,options);
  // Fail closed: the fixture cannot send any request to a real external API.
  if(!url.hostname.endsWith('.supabase.co'))return json({message:'Rede externa bloqueada no teste'},503);
  if(url.pathname==='/auth/v1/token')return json({access_token:'fixture-only',refresh_token:'fixture-only',expires_in:3600,user:{id:base.profiles[0].id}});
  if(url.pathname.endsWith('/rpc/erp_collab_directory'))return json(base.profiles);
  if(url.pathname.endsWith('/rpc/integracao_gravar')) {
    const {operacoes}=JSON.parse(options.body);
    for(const op of operacoes) {
      if(!op.table)return json({message:'Ação não implementada no simulador'},400);
      const rows=base[op.table] ||= [];
      const matches=r=>Object.entries(op.key).every(([k,v])=>r[k]===v);
      if(op.insert)rows.push({...op.key,...op.changes});
      else {const row=rows.find(matches);if(!row)return json({message:'Registro ausente'},400);if(op.remove)base[op.table]=rows.filter(r=>!matches(r));else Object.assign(row,op.changes);}
    }
    writes++;document.getElementById('diagnostico').textContent=`Gravações: ${writes}; tabelas: ${operacoes.map(o=>o.table).join(', ')}`;
    return json({aliases:{}});
  }
  const table=url.pathname.split('/').at(-1);
  if(table in base) {
    let rows=base[table];const id=url.searchParams.get('id');if(id?.startsWith('eq.'))rows=rows.filter(r=>r.id===id.slice(3));
    const offset=Number(url.searchParams.get('offset')||0);return json(rows.slice(offset,offset+Number(url.searchParams.get('limit')||500)));
  }
  return json({message:`Consulta inesperada no teste: ${url.pathname}`},500);
};
await import('../src/main.jsx');
