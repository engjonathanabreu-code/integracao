// Development-only harness. Never included in the production entry point.
import {fixture,id} from './fixture.js';
const base=fixture();base.meta_arquivos=[];base.erp_exclusoes_chat=[];base.documentos=[];
if(new URLSearchParams(location.search).has('calendario')) {
  const hoje=new Date().toISOString().slice(0,10);
  base.profiles.push({id:id(70),nome:'Ana Topografia',tipo:'Topografia',ativo:true},{id:id(71),nome:'Bia Projetos',tipo:'Projetos',ativo:true});
  base.meta_setores.push({id:id(72),nome:'Projetos',ativo:true});
  base.metas[0].prazo=hoje;base.metas[0].titulo='Meta ativa da Ana';base.meta_responsaveis=[{meta_id:id(7),usuario_id:id(70)}];
  base.metas.push({...base.metas[0],id:id(73),titulo:'Meta ativa da Bia',setor_id:id(72)},{...base.metas[0],id:id(74),titulo:'Meta concluída invisível',status:'Concluído'});
  base.meta_responsaveis.push({meta_id:id(73),usuario_id:id(71)});
  base.etapas_plano[0].status='Em andamento';base.etapas_plano[0].prazo=hoje;base.etapas_plano[0].titulo='Etapa em andamento da Ana';base.etapa_responsaveis=[{etapa_id:id(9),usuario_id:id(70)}];
  base.etapas_plano.push({...base.etapas_plano[0],id:id(75),titulo:'Etapa concluída invisível',status:'Concluída'});
}
if(new URLSearchParams(location.search).has('calendario')) {
 const hoje=new Date().toISOString().slice(0,10);
 base.erp_agendas=[{id:id(81),nome:'Sala de reuniões',cor:'#2563b8'},{id:id(82),nome:'Carro',cor:'#198754'}];
 const evento={inicio:hoje+'T13:00:00-03:00',fim:hoje+'T14:00:00-03:00',status:'ativo',publico:true,cor:'#2563b8',participantes:[],created_by:id(71)};
 base.erp_eventos=[{...evento,id:id(83),titulo:'Reserva compartilhada',agenda_id:id(81)},{...evento,id:id(84),titulo:'Compromisso pessoal da Bia'},{...evento,id:id(85),titulo:'Compromisso pessoal da Ana',participantes:[id(70)]}];
}
const original=window.fetch.bind(window);let writes=0;
const objects=new Map();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin===location.origin || url.protocol==='data:')return original(input,options);
  // Fail closed: the fixture cannot send any request to a real external API.
  if(!url.hostname.endsWith('.supabase.co'))return json({message:'Rede externa bloqueada no teste'},503);
  if(url.pathname==='/auth/v1/token')return json({access_token:'fixture-only',refresh_token:'fixture-only',expires_in:3600,user:{id:new URLSearchParams(location.search).get('perfil')==='topografia'?id(70):base.profiles[0].id}});
  if(url.pathname.includes('/storage/v1/object/')) {
    const path=url.pathname.split('/integracao/')[1];
    if(options.method==='POST'){objects.set(path,new TextDecoder().decode(options.body));return json({});}
    return new Response(objects.get(path)||'');
  }
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
  const table=url.pathname.endsWith('/rpc/integracao_eventos')?'erp_eventos':url.pathname.split('/').at(-1);
  if(table in base) {
    let rows=base[table];const id=url.searchParams.get('id');if(id?.startsWith('eq.'))rows=rows.filter(r=>r.id===id.slice(3));
    const offset=Number(url.searchParams.get('offset')||0);return json(rows.slice(offset,offset+Number(url.searchParams.get('limit')||500)));
  }
  return json({message:`Consulta inesperada no teste: ${url.pathname}`},500);
};
await import('../src/main.jsx');
const {agendarArquivo}=await import('../src/arquivos-compartilhados.js');
const assetButton=document.createElement('button');assetButton.textContent='Verificar arquivo isolado';assetButton.style.cssText='position:fixed;bottom:30px;right:0;z-index:99999;background:white;color:black;padding:4px';
assetButton.onclick=()=>agendarArquivo('integracao-prf-modelo-v4','<p>Modelo fictício de verificação</p>');document.body.append(assetButton);
