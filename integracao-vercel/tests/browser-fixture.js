// Development-only harness. Never included in the production entry point.
import {resumirMoradores} from '../src/resumo-moradores.js';
import {compactarResumo} from '../src/resumo-transporte.js';
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
base.fin_receb_municipios.push({id:id(102),nome:'Segundo município',uf:'SC',prefixo:'SEG'});
base.fin_receb_remessas.push({id:id(103),municipio_id:id(102),codigo:'SEG01',nome:'Segunda remessa'});
base.fin_receb_clientes.push({...base.fin_receb_clientes[0],id:id(104),municipio_id:id(102),remessa_id:id(103),nome:'Morador do segundo',codigo:'SEG01_001'});
if(new URLSearchParams(location.search).has('confrontantes') || new URLSearchParams(location.search).has('prf')) {
  base.fin_receb_clientes[0].cpf_cnpj='52998224725';
  base.integracao_moradores.push({colecao:'processos',registro_id:id(4),referencia_tabela:'fin_receb_clientes',referencia_id:id(4),dados:{id:id(4),etapa:3,nucleoId:id(5),extras:{'2be328c2-7ccd-4448-a942-cfc6f62631fc':'Rua já cadastrada'},checks:{medicao:true,lepac:true,conferencia:true},unidades:[{id:'un1',area:'200',memorial:'Memorial fictício suficientemente longo para validar a etapa.'}],campo:{respostas:{},fotos:[],data:''}}});
}
if(new URLSearchParams(location.search).has('gerador')) {
  base.integracao_nucleos.push({colecao:'nucleos',registro_id:id(5),referencia_tabela:'processos_kanban',referencia_id:id(5),dados:{id:id(5),etapa:2,checks:{crfEmitida:new URLSearchParams(location.search).has('crf')}}});
  base.integracao_configuracoes.push({colecao:'config',registro_id:'ajustesMunicipio',referencia_tabela:'integracao_config',dados:{valor:{[id(2)]:{prefeitura:{cnpj:'00.000.000/0000-00',endereco:'Sede teste',prefeito:{nome:'Prefeito de teste',cargo:'Prefeito'}},comarca:{nome:'Comarca teste',estadoPorExtenso:'Santa Catarina'}}}}});
  base.fin_receb_clientes[0].nome='Moradora Teste'; base.fin_receb_clientes[0].cpf_cnpj='52998224725';
  const pessoa={nome:'Moradora Teste',sexo:'Feminino',cpf:'52998224725',rg:'12345',rgOrgao:'SSP',rgUf:'SC',nacionalidade:'Brasileira',profissao:'Professora',estadoCivil:'Solteiro(a)',renda:'1500'};
  const endereco={logradouro:'Rua Teste',numero:'10',bairro:'Centro',municipio:'Residência Teste',uf:'SC',cep:'89000-000'};
  base.integracao_moradores.push({colecao:'processos',registro_id:id(4),referencia_tabela:'fin_receb_clientes',referencia_id:id(4),dados:{id:id(4),etapa:2,nucleoId:id(5),requerente:pessoa,endereco,social:{estadoCivil:'Solteiro(a)'},documentosGerados:[{id:'proc-antiga',tipo:'procuracao',nome:'Procuração antiga',data:'2026-09-10T12:00:00Z',por:'Equipe teste',representantes:[{id:'usado',nome:'Representante usado'}],condicoes:'para Representante usado',html:'<p>Procuração histórica para Representante usado</p>'}]}});
  base.integracao_configuracoes.push({colecao:'config',registro_id:'advogados',referencia_tabela:'integracao_config',dados:{valor:[{id:'mantido',nome:'Representante disponível',ativo:true},{id:'usado',nome:'Representante usado',ativo:false},{id:'sem-uso',nome:'Representante nunca usado',ativo:true}]}});
}
let detailReads=[];
if(new URLSearchParams(location.search).has('duracao'))base.erp_eventos.push({id:id(150),titulo:'Evento de doze horas',inicio:'2026-09-15T08:00:00Z',fim:'2026-09-15T20:00:00Z',status:'ativo',publico:true,participantes:[],created_by:id(1)});
const original=window.fetch.bind(window);let writes=0;
const objects=new Map();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.pathname==='/api/resumo-moradores'){const {contexto}=JSON.parse(options.body);return json({resumo:compactarResumo(resumirMoradores({clientes:base.fin_receb_clientes,complementos:base.integracao_moradores},contexto))});}
  if(url.origin===location.origin || url.protocol==='data:')return original(input,options);
  // Fail closed: the fixture cannot send any request to a real external API.
  if(!url.hostname.endsWith('.supabase.co'))return json({message:'Rede externa bloqueada no teste'},503);
  if(url.pathname==='/auth/v1/token')return json({access_token:'fixture-only',refresh_token:'fixture-only',expires_in:3600,user:{id:new URLSearchParams(location.search).get('perfil')==='topografia'?id(70):base.profiles[0].id}});
  if(url.pathname.includes('/storage/v1/object/')) {
    const path=url.pathname.split('/integracao/')[1];
    if(options.method==='POST'){objects.set(path,new TextDecoder().decode(options.body));return json({});}
    return new Response(objects.get(path)||'');
  }
  if(url.pathname.endsWith('/rpc/integracao_moradores_carga')){const {municipio,inicio}=JSON.parse(options.body);detailReads.push(municipio);document.getElementById('diagnostico').textContent='Consultas de moradores: '+detailReads.join(', ');return json({clientes:inicio?[]:base.fin_receb_clientes.filter(c=>c.municipio_id===municipio),complementos:inicio?[]:base.integracao_moradores.filter(e=>base.fin_receb_clientes.some(c=>c.id===e.referencia_id&&c.municipio_id===municipio)),total:0});}
  if(url.pathname.endsWith('/rpc/integracao_uso_representantes')) { const {contarProcuracoes}=await import('../src/representantes.js'); const representantes=base.integracao_configuracoes.find(e=>e.registro_id==='advogados')?.dados.valor||[];return json(Object.fromEntries(representantes.map(a=>[a.id,contarProcuracoes(base.integracao_moradores.map(e=>e.dados),a)]))); }
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
if(new URLSearchParams(location.search).has('prf') || new URLSearchParams(location.search).has('gerador')) {
  // Captura a saída real de baixarArquivo para inspeção, sem depender do suporte
  // a downloads de blob do navegador usado na verificação automatizada.
  const blobs=new Map(), criarURL=URL.createObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=criarURL(blob);blobs.set(url,blob);return url};
  document.addEventListener('click',async event=>{
    const a=event.target.closest?.('a[download]'),blob=a&&blobs.get(a.href);if(!blob)return;
    event.preventDefault();
    let out=document.getElementById('exportacao-teste');if(!out){out=document.createElement('pre');out.id='exportacao-teste';out.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%';document.body.append(out)}
    out.setAttribute('data-nome',a.download);out.setAttribute('data-tipo',blob.type);out.textContent=await blob.text();
  },true);
  const {instalarArmazenamento}=await import('../src/armazenamento-local.js');instalarArmazenamento();
  await window.storage.set('integracao-prf-modelo-v4','<h1>PRF {{municipio.nome}}</h1><p>{{#se:nucleo.nome}}Núcleo {{nucleo.nome}}{{/se}}</p><table><tr><td>{{#cada:unidades}}{{unidade.codigo}}</td><td>{{unidade.nome}}</td><td>{{unidade.cpf}}{{/cada}}</td></tr></table><p>{{bloco.lista_lotes}}</p><p>Responsável: ______</p><mark>Redação alternativa para decisão humana</mark>');
}
await import('../src/main.jsx');
const {agendarArquivo}=await import('../src/arquivos-compartilhados.js');
const assetButton=document.createElement('button');assetButton.textContent='Verificar arquivo isolado';assetButton.style.cssText='position:fixed;bottom:30px;right:0;z-index:99999;background:white;color:black;padding:4px';
assetButton.onclick=()=>agendarArquivo('integracao-prf-modelo-v4','<p>Modelo fictício de verificação</p>');document.body.append(assetButton);

