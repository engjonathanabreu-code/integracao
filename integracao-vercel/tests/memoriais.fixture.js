// Development-only harness. Never included in the production entry point.
import {resumirMoradores} from '../src/resumo-moradores.js';
import {compactarResumo} from '../src/resumo-transporte.js';
import {fixture,id} from './fixture.js';
const base=fixture();base.meta_arquivos=[];base.erp_exclusoes_chat=[];base.documentos=[];
base.fin_receb_municipios.push({id:id(102),nome:'Segundo município',uf:'SC',prefixo:'SEG'});
base.fin_receb_remessas.push({id:id(103),municipio_id:id(102),codigo:'SEG01',nome:'Segunda remessa'});
base.fin_receb_clientes.push({...base.fin_receb_clientes[0],id:id(104),municipio_id:id(102),remessa_id:id(103),nome:'Morador do segundo',codigo:'SEG01_001'});
base.fin_receb_clientes[0].nome='Morador dos memoriais';base.fin_receb_clientes[0].cpf_cnpj='52998224725';
base.integracao_nucleos.push({colecao:'nucleos',registro_id:id(5),referencia_tabela:'processos_kanban',referencia_id:id(5),dados:{id:id(5),etapa:Number(new URLSearchParams(location.search).get('etapa')||1)}});
base.integracao_moradores.push({colecao:'processos',registro_id:id(4),referencia_tabela:'fin_receb_clientes',referencia_id:id(4),dados:{id:id(4),nucleoId:id(5),etapa:3,enderecoImovel:{logradouro:'Rua do imóvel',numero:'10',bairro:'Centro',cep:'89000-000'},qualificacao:{textos:{memorial:'Morador dos memoriais, qualificação cadastrada.'}},unidades:[{id:'u1',area:'200',memorial:'Memorial manual já cadastrado.',caracteristicas:'Terreno sem benfeitorias',campoIntacto:'preservar'},{id:'u2',area:'100',memorial:'Memorial da segunda unidade.',campoIntacto:'preservar irmã'}]}}); 
base.integracao_configuracoes.push({colecao:'config',registro_id:'memoriais',referencia_tabela:'integracao_config',dados:{valor:{sistema:'UTM',meridiano:'51° WGr',prefixo:'V',responsavel:{nome:'Técnico de teste',registro:'CREA teste'}}}});
let detailReads=[];
const original=window.fetch.bind(window);let writes=0;
const objects=new Map();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.pathname==='/api/resumo-moradores'){const {contexto}=JSON.parse(options.body);return json({resumo:compactarResumo(resumirMoradores({clientes:base.fin_receb_clientes,complementos:base.integracao_moradores},contexto))});}
  if(url.origin===location.origin || url.protocol==='data:')return original(input,options);
  // Fail closed: the fixture cannot send any request to a real external API.
  if(!url.hostname.endsWith('.supabase.co'))return json({message:'Rede externa bloqueada no teste'},503);
  if(url.pathname==='/auth/v1/token')return json({access_token:'fixture-only',refresh_token:'fixture-only',expires_in:3600,user:{id:base.profiles[0].id}});
  if(url.pathname.includes('/storage/v1/object/')) {
    const path=url.pathname.split('/integracao/')[1];
    if(options.method==='POST'){objects.set(path,new TextDecoder().decode(options.body));return json({});}
    return new Response(objects.get(path)||'');
  }
  if(url.pathname.endsWith('/rpc/integracao_moradores_carga')){const {municipio,inicio}=JSON.parse(options.body);detailReads.push(municipio);document.getElementById('diagnostico').textContent='Consultas de moradores: '+detailReads.join(', ');return json({clientes:inicio?[]:base.fin_receb_clientes.filter(c=>c.municipio_id===municipio),complementos:inicio?[]:base.integracao_moradores.filter(e=>base.fin_receb_clientes.some(c=>c.id===e.referencia_id&&c.municipio_id===municipio)),total:0});}
  if(url.pathname.endsWith('/rpc/erp_collab_directory'))return json(base.profiles);
  if(url.pathname.endsWith('/rpc/integracao_gravar')) {
    const {operacoes}=JSON.parse(options.body);
    for(const op of operacoes) {
      if(['fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','processos_kanban'].includes(op.table))return json({message:'Escrita canônica proibida no teste'},500);
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
if(true) {
  // Captura a saída real de baixarArquivo para inspeção, sem depender do suporte
  // a downloads de blob do navegador usado na verificação automatizada.
  const blobs=new Map(), criarURL=URL.createObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=criarURL(blob);blobs.set(url,blob);return url};
  document.addEventListener('click',async event=>{
    const a=event.target.closest?.('a[download]'),blob=a&&blobs.get(a.href);if(!blob)return;
    event.preventDefault();
    let out=document.getElementById('exportacao-teste');if(!out){out=document.createElement('pre');out.id='exportacao-teste';out.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';document.body.append(out)}
    out.setAttribute('data-nome',a.download);out.setAttribute('data-tipo',blob.type);out.textContent=await blob.text();
  },true);
}
await import('../src/main.jsx');
