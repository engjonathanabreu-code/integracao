export function instalarMetasVendasFixture(base) {
 const metas=[],estrategias=[];
 return (url,options,json)=>{
  const t=url.pathname.split('/').at(-1),method=options.method||'GET';
  if(t==='integracao_crm_metas_painel')return json(metas.map(m=>({...m,realizado:2*m.participantes.length,sem_valor:0,por_usuario:m.participantes.map(id=>({id,nome:base.profiles.find(p=>p.id===id)?.nome,realizado:2}))})));
  if(!['integracao_crm_metas','integracao_agente_estrategias'].includes(t))return;
  const rows=t==='integracao_crm_metas'?metas:estrategias;
  if(method==='POST'){const r={...JSON.parse(options.body),id:crypto.randomUUID(),versao:1,status:'ativa',atualizado_em:new Date().toISOString()};rows.push(r);return json([r]);}
  if(method==='PATCH'){const id=url.searchParams.get('id')?.slice(3),a=url.searchParams.get('agente')?.slice(3),r=rows.find(r=>id?r.id===id:r.agente===a);if(!r)return json([]);Object.assign(r,JSON.parse(options.body),{versao:r.versao+1});return json([r]);}
  return json(rows);
 };
}
