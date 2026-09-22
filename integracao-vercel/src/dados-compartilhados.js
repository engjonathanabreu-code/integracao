import {setorDoPerfilERP} from './permissoes.js';
import {expandirResumo} from './resumo-transporte.js';
import {tabelasProprias,destinoComplemento,unirCampos,reunirComplementos} from './persistencia-modulos.js';
// Canonical ERP rows are read in place. Only explicit user edits produce writes.
// Tokens stay in memory; local storage contains drafts, never credentials.
export const configERP = {
  url: import.meta.env?.VITE_ERP_SUPABASE_URL || 'https://ycdsyilyvaxslkwbkxyo.supabase.co',
  chave: import.meta.env?.VITE_ERP_SUPABASE_KEY || 'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4',
};
let session = null, refreshing = null;
let indiceClientes = null, indiceJob = null, indiceGeracao = 0, indiceCarregadoEm = 0;
const VALIDADE_INDICE_MS = 5 * 60 * 1000;
export function invalidarIndiceClientes() { indiceGeracao++; indiceClientes = null; indiceJob = null; indiceCarregadoEm = 0; }
export function obterIndiceClientes() { return session ? indiceClientes : null; }
export function definirSessao(dados) {
  if (!dados || !session || !dados.user?.id || dados.user.id !== session.user?.id) invalidarIndiceClientes();
  session = dados ? { ...dados, expires_at: Date.now() + dados.expires_in * 1000 } : null; }
export function temSessao() { return !!session; }
export async function requisicao(path, options = {}) {
  if (!session) throw new Error('Entre novamente com sua conta para acessar os dados compartilhados.');
  if (session.expires_at < Date.now() + 60000) {
    if (!refreshing) refreshing = (async () => {
      const r = await fetch(`${configERP.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: configERP.chave, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!r.ok) throw new Error('Sua sessão expirou. Entre novamente; suas alterações locais foram preservadas.');
      definirSessao(await r.json());
    })().finally(() => { refreshing = null; });
    await refreshing;
  }
  const r = await fetch(`${configERP.url}/rest/v1/${path}`, { signal:AbortSignal.timeout(25000), ...options, headers: { apikey: configERP.chave, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...options.headers } });
  const body = await r.json().catch(() => null);
  if (!r.ok) {const erro=new Error(body?.message || `Não foi possível acessar ${path.split('?')[0]} (${r.status}).`);erro.status=r.status;throw erro;}
  return body;
}
export async function lerTabela(tabela, campos = '*', filtro = '') {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const ordem = compositeOrder[tabela] || (tabelasProprias.includes(tabela)||tabela==='integracao_arquivos'?'colecao,registro_id':'id');
    const page = await requisicao(`${tabela}?select=${encodeURIComponent(campos)}${filtro}&order=${ordem}&limit=500&offset=${offset}`);
    all.push(...page); if (page.length < 500) return all;
  }
}
export async function enviarArquivoSemanal(semana, arquivo) {
  if(!arquivo||arquivo.size>25*1024*1024)throw new Error('Escolha um arquivo de até 25 MB.');
  await requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'});
  const caminho=`${semana}/${crypto.randomUUID()}/${arquivo.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const r=await fetch(`${configERP.url}/storage/v1/object/integracao-semanal/${caminho}`,{method:'POST',headers:{apikey:configERP.chave,Authorization:`Bearer ${session.access_token}`,'Content-Type':arquivo.type||'application/octet-stream','x-upsert':'false'},body:arquivo});
  if(!r.ok)throw new Error('Não foi possível enviar o arquivo.');
  return caminho;
}
export async function abrirArquivoSemanal(caminho) {
  await requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'});
  const r=await fetch(`${configERP.url}/storage/v1/object/sign/integracao-semanal/${caminho}`,{method:'POST',headers:{apikey:configERP.chave,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60})});
  if(!r.ok)throw new Error('Sem acesso ao arquivo.');
  const body=await r.json();return `${configERP.url}/storage/v1${body.signedURL}`;
}
const TABLES = ['profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','processos_kanban','processos_kanban_andamentos','processos_kanban_observacoes','processos_kanban_historico','meta_setores','metas','meta_responsaveis','meta_checklist','meta_comentarios','meta_historico','ordens_servico','ordem_servico_comentarios','planos_trabalho','etapas_plano','etapa_responsaveis','entregaveis','comentarios_plano','projetos','erp_agendas','erp_eventos','erp_evento_respostas','erp_conversas','erp_mensagens','integracao_complementos'];
const compositeOrder = { meta_responsaveis: 'meta_id,usuario_id', etapa_responsaveis: 'etapa_id,usuario_id', erp_evento_respostas: 'evento_id,usuario_id', integracao_complementos: 'colecao,registro_id' };
export async function tokenTempoReal(){if(!session)return null;if(session.expires_at<Date.now()+60000)await requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'});return session?.access_token||null;}
export async function lerBase({municipios=[],tabelas=null,anterior=null}={}) {
  const pairs = await Promise.all([...TABLES,...tabelasProprias,'integracao_arquivos','meta_arquivos','erp_exclusoes_chat','documentos'].filter(t=>!['fin_receb_clientes','integracao_moradores'].includes(t)&&(!tabelas||tabelas.includes(t))).map(async table => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const fields = table === 'profiles' ? 'id,nome,email,tipo,setor,ativo' : '*';
      const path = `${table==='erp_eventos'?'rpc/integracao_eventos':table}?select=${fields}&order=${compositeOrder[table] || (tabelasProprias.includes(table)||table==='integracao_arquivos'?'colecao,registro_id':'id')}&limit=500&offset=${offset}`;
      const page = await requisicao(path,table==='erp_eventos'?{method:'POST',body:'{}'}:{});
      rows.push(...page); if (page.length < 500) break;
    }
    return [table, rows];
  }));
  const result = {...(anterior||{}),...Object.fromEntries(pairs)};
  if(!tabelas||tabelas.includes('fin_receb_clientes'))result._contagensClientes=await requisicao('rpc/integracao_contagens_clientes',{method:'POST',body:'{}'});
  // projetar reúne complementos; não reutilize cópias de tabelas próprias removidas.
  if(tabelas&&!tabelas.includes('integracao_complementos'))result.integracao_complementos=(result.integracao_complementos||[]).filter(e=>!e._tabela||e._tabela==='integracao_complementos');
  // The existing ERP directory exposes names/roles without exposing personal fields.
  if(!tabelas||tabelas.includes('profiles')){
  const directory = await requisicao('rpc/erp_collab_directory', { method: 'POST', body: '{}' });
  result.profiles = directory.map(p => ({ ...p, ativo: true, ...(result.profiles.find(x => x.id === p.id) || {}) }));
  }
  if(!tabelas||tabelas.some(t=>['fin_receb_clientes','integracao_moradores'].includes(t))){
  result.fin_receb_clientes=[];result.integracao_moradores=[];
  for(const municipio of municipios){const carga=await lerMoradoresMunicipio(municipio);result.fin_receb_clientes.push(...carga.clientes);result.integracao_moradores.push(...carga.complementos);}
  }
  return result;
}
export async function lerMoradoresMunicipio(municipio) {
  const pagina=inicio=>requisicao('rpc/integracao_moradores_carga',{method:'POST',body:JSON.stringify({municipio,resumo:false,inicio})});
  const carga=await pagina(0);
  for(let inicio=500;inicio<carga.total;inicio+=500){const next=await pagina(inicio);carga.complementos.push(...next.complementos);}
  return carga;
}
export async function lerResumoMoradores(db) {
  // Refresh the caller's session if needed, without exposing it to application state.
  await requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'});
  const contexto=Object.fromEntries(['nucleos','campos','checklistCampo','ajustesRequisitos','ajustesMunicipio'].map(k=>[k,db[k]]));
  contexto.nucleos=(db.nucleos||[]).map(({id,codigo,criterio})=>({id,codigo,criterio}));
  const response=await fetch('/api/resumo-moradores',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({contexto}),signal:AbortSignal.timeout(90000)});
  const body=await response.json();
  if(!response.ok)throw new Error(body.message||'Não foi possível carregar as pendências.');
  return expandirResumo(body.resumo);
}
export const copy = x => structuredClone(x);
export const eq = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const text = x => x ?? '';
const normalize = x => text(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const userId = id => id ? `erp_${id}` : '';
const rawUser = id => id?.startsWith('erp_') ? id.slice(4) : id || null;
const nullText = x => x === '' || x === undefined ? null : x;
const uuid = id => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id || '');
const fieldValue=(value,path)=>path.split('.').reduce((v,k)=>v?.[k],value);
const decimal=v=>Number(typeof v==='string' && v.includes(',')?v.replace(/\./g,'').replace(',','.'):v||0);
const group = (rows, key, id) => (rows || []).filter(r => r[key] === id);
const nestedFields={nucleos:['andamentos','observacoes','historicoEtapas'],metas:['responsaveis','checklist','comentarios','historico','arquivos','associacao_tipo','associacao_id'],planos:['etapas','comentarios','documentos'],etapas:['responsaveis','entregaveis','comentarios'],ordensServico:['comentarios'],eventos:['respostas','participantes','entidade','agendaId','serieERP'],conversas:['mensagens','participantes','entidade','criadoPor','exclusaoSolicitada']};
const sectors = { Administrador:'diretoria', 'Diretor Técnico':'diretoria', 'Diretor de Projetos':'diretoria', Financeiro:'financeiro', Comercial:'comercial', Atendimentos:'comercial', Topografia:'topografia', Projetos:'projeto', 'Pós-protocolo':'posprotocolo', 'Jurídico':'juridico' };

// Metadata is kept separately from each rendered entity, so it never becomes app data.
export function projetar(base, local) {
  base={...base,integracao_complementos:reunirComplementos(base)};
  const aliases=Object.fromEntries((local.usuarios||[]).filter(u=>uuid(u.erpRef)).map(u=>[u.id,userId(u.erpRef)]));
  const relink=value=>{
    if(typeof value==='string')return aliases[value]||value;
    if(Array.isArray(value))return value.map(relink);
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[aliases[k]||k,relink(v)]));
    return value;
  };
  const db = relink(copy(local)), bindings = [];
  db._contagensClientes=base._contagensClientes??null;
  if(base._moradoresResumo){
    const loaded=new Set((base.fin_receb_clientes||[]).map(r=>r.id));
    const own=new Set((base.integracao_moradores||[]).map(r=>r.registro_id));
    const keep=(db.processos||[]).filter(p=>!p._resumo&&(!p._compartilhado||loaded.has(p.financeiroRef||p.id)||own.has(p.id)));
    const ids=new Set(keep.map(p=>p.id));
    db.processos=[...keep,...base._moradoresResumo.filter(p=>!ids.has(p.id))];
  }
  for(const c of ['auditoria','notificacoes','regrasIA','tiposDocumento','advogados','camposComercial'])if(Array.isArray(db[c]))db[c]=db[c].filter(r=>!r._compartilhado);
  const names = Object.fromEntries(base.profiles.map(p => [p.id,p.nome]));
  const extra = new Map(base.integracao_complementos.map(r => [`${r.colecao}:${r.registro_id}`,r]));
  const bind = (collection, row, view, map, table, parent = null) => {
    const p=parent?(db[parent.collection]||[]).find(x=>x.id===parent.id):null;
    const siblings=parent ? (parent.childId?p?.[parent.field]?.find(x=>x.id===parent.childId)?.[parent.childField]:p?.[parent.field]) : db[collection];
    const existing = (siblings || []).find(x => x.id === view.id || x.erpId === row.id || x.erpRef === row.id || x.externo?.kanbanId === row.id);
    if (existing) view.id = existing.id;
    const extension = extra.get(`${collection}:${view.id}`);
    const saved=unirCampos(existing?._resumo?{}:existing||{},extension?.dados||{});
    const value = { ...saved, ...view };
    const canonical=new Set(['id','erpId','erpRef','financeiroRef','tipoERP',...(collection==='usuarios'?['setor']:[]),'origem','externo','criadoPor','criadoEm',...Object.keys(map).map(p=>p.split('.')[0]),...(nestedFields[collection]||[])]);
    for(const [field,v] of Object.entries(extension?.dados||{}))if(!canonical.has(field))value[field]=copy(v);
    const ownFields={usuarios:['tema','agendaPessoal','calendarioOculto','online','ultimaAtividade'],nucleos:['remessaId','etapa','campos','checks','criterio','codigo'],processos:['nucleoId','etapa','motivoSituacao','conjuge','endereco','imovel','social','extras','docs','checks','campos','campo','unidades'],planos:['municipioId','municipioNome','uf','remessaId'],conversas:['lidaPor']};
    for(const field of ownFields[collection]||[]) if(saved[field]!==undefined) value[field]=saved[field];
    if(collection==='conversas' && !row.entidade_id && saved.entidade)value.entidade=saved.entidade;
    if(collection==='processos') {
      // Pessoa jurídica (campo do Integrado): o documento canônico cpf_cnpj vale como CNPJ e o CPF fica vazio.
      const pj=saved.requerente?.tipoPessoa==='juridica';
      value.requerente={...view.requerente,...saved.requerente,nome:row.nome,cpf:pj?'':(row.cpf_cnpj||''),cnpj:pj?(row.cpf_cnpj||''):(saved.requerente?.cnpj||'')};
      if(pj){delete map['requerente.cpf'];map['requerente.cnpj']='cpf_cnpj';}
      if(saved.situacao && (saved.situacao==='Ativo')===row.ativo)value.situacao=saved.situacao;
      const amounts={valorTotal:'valor_global',entrada:'valor_entrada',parcelas:'numero_parcelas',valorParcela:'valor_parcela',diaVencimento:'dia_vencimento'};
      value.comercial={modalidade:Number(row.valor_entrada)>0?'Entrada e parcelas':'Parcelado sem entrada',reajuste:'Sem reajuste',observacoes:'',...saved.comercial,primeiroVencimento:row.primeiro_vencimento||''};
      for(const [field,column] of Object.entries(amounts)) {value.comercial[field]=row[column]==null?'':String(row[column]).replace('.',',');map[`comercial.${field}`]={column,encode:decimal};}
      map['comercial.primeiroVencimento']='primeiro_vencimento';
    }
    bindings.push({ collection, id: value.id, table, key: {id:row.id}, row, map, parent, view: value });
    return value;
  };
  const merge = (collection, rows) => {
    const ids = new Set(rows.map(x => x.id));
    // Keep unmatched local records. No import replaces a collection or deletes a record.
    db[collection] = [...rows, ...(db[collection] || []).filter(x => !ids.has(x.id) && (!x._compartilhado || (collection==='processos'&&x._resumo)))];
    rows.forEach(x => { x._compartilhado = true; });
  };
  const direct = fields => Object.fromEntries(fields.split(',').map(x => [x,x]));
  merge('usuarios', base.profiles.map(p => bind('usuarios',p,{id:userId(p.id),erpRef:p.id,nome:p.nome,email:p.email || '',tipoERP:p.tipo,setor:setorDoPerfilERP(p, sectors),funcao:p.tipo?.startsWith('Diretor') || p.tipo === 'Administrador' ? 'Diretor' : 'Analista',ativo:p.ativo !== false,origem:'ERP',online:false,agendaPessoal:[],calendarioOculto:[]},{nome:'nome',email:'email',ativo:'ativo'},'profiles')));
  const uid = id => db.usuarios.find(x=>x.erpRef===id)?.id || userId(id);
  merge('municipios',base.fin_receb_municipios.map(m=>bind('municipios',m,{id:m.id,nome:m.nome,uf:m.uf,prefixo:m.prefixo,origem:['ERP'],criado:text(m.created_at).slice(0,10)},direct('nome,uf,prefixo'),'fin_receb_municipios')));
  merge('remessas',(base.fin_receb_remessas||[]).map(r=>bind('remessas',r,{id:r.id,municipioId:r.municipio_id,numero:Number(text(r.codigo).match(/\d+$/)?.[0])||1,titulo:r.nome||r.codigo,criada:text(r.created_at).slice(0,10),origem:['ERP'],externo:{financeiro:r.id}}, {titulo:'nome',municipioId:'municipio_id'},'fin_receb_remessas')));
  const pessoa=()=>({nome:'',statusCRM:'',statusFinanceiro:'',sexo:'',nacionalidade:'Brasileira',rg:'',rgOrgao:'',cpf:'',nascimento:'',mae:'',pai:'',estadoCivil:'',regimeBens:'',dataUniao:'',profissao:'',renda:'',telefone:'',email:''});
  const residentsByReference=new Map(base.integracao_complementos.filter(e=>e.colecao==='processos'&&e.referencia_id).map(e=>[e.referencia_id,e.registro_id]));
  merge('processos',(base.fin_receb_clientes||[]).map(r=>{
    const found=(db.processos||[]).find(p=>p.id===r.id || p.financeiroRef===r.id);
    const old=found?._resumo?{id:found.id}:found||{id:residentsByReference.get(r.id)||r.id};
    return bind('processos',r,{id:old?.id||r.id,financeiroRef:r.id,municipioId:r.municipio_id,remessaId:r.remessa_id,codigo:r.codigo,nucleoId:old?.nucleoId||'',etapa:old?.etapa||0,situacao:r.ativo?'Ativo':'Inativo',motivoSituacao:old?.motivoSituacao||'',requerente:{...pessoa(),...old?.requerente,nome:r.nome,cpf:r.cpf_cnpj||''},conjuge:old?.conjuge||pessoa(),endereco:old?.endereco||{logradouro:'',numero:'',complemento:'',bairro:'',municipio:'',uf:'',cep:''},imovel:old?.imovel||{area:'',comprovantePosse:''},social:old?.social||{ocupantes:'',rendaFamiliar:'',possuiImovel:'',modalidade:''},extras:old?.extras||{},docs:old?.docs||[],checks:old?.checks||{},campos:old?.campos||{},campo:old?.campo||{respostas:{},fotos:[],data:'',por:'',geo:null},numeroCliente:Number(text(r.codigo).match(/\d+$/)?.[0])||0,unidades:old?.unidades||[{id:`unidade_${r.id}`,area:'',memorial:'',loteQuadra:''}]}, {codigo:'codigo',municipioId:'municipio_id',remessaId:'remessa_id','requerente.nome':'nome','requerente.cpf':'cpf_cnpj',situacao:{column:'ativo',encode:v=>v==='Ativo'}},'fin_receb_clientes');
  }));
  // Municípios sintéticos (criados só a partir do nome no kanban, id "municipio_...") são substituídos pelo registro real
  // do financeiro quando ele passa a existir, e tudo que apontava para o sintético é religado ao id real.
  {
    const reais=db.municipios.filter(m=>uuid(m.id)); const troca={};
    db.municipios=db.municipios.filter(m=>{ if(uuid(m.id))return true; const real=reais.find(r=>normalize(r.nome)===normalize(m.nome)&&(r.uf||'SC')===(m.uf||'SC')); if(real){troca[m.id]=real.id;return false;} return true; });
    if(Object.keys(troca).length) for(const col of ['remessas','nucleos','processos','planos']) (db[col]||[]).forEach(x=>{ if(troca[x.municipioId]) x.municipioId=troca[x.municipioId]; });
  }
  const municipality = (name,uf) => {
    let m = db.municipios.find(x=>normalize(x.nome)===normalize(name) && (x.uf||'SC')===(uf||'SC'));
    if (!m) { m={id:`municipio_${normalize(name)}_${uf||'SC'}`,nome:name,uf:uf||'SC',prefixo:'',origem:['ERP'],criado:''}; db.municipios.push(m); }
    return m;
  };
  const comment = r=>({id:r.id,autor:names[r.autor_id]||r.autor_nome||'Equipe',por:names[r.autor_id]||r.autor_nome||'Equipe',texto:r.texto,data:r.created_at,setor:r.autor_setor||''});
  merge('nucleos',base.processos_kanban.filter(k=>!k.excluido_erp).map(k=>{
    const m=municipality(k.municipio,k.estado);
    const old=(db.nucleos||[]).find(x=>x.externo?.kanbanId===k.id || x.id===k.id);
    const id=old?.id||k.id;
    const nested=(table, collection, map, make)=>group(base[table],'processo_id',k.id).map(r=>bind(collection,r,make(r),map,table,{collection:'nucleos',id,field:collection}));
    return bind('nucleos',k,{id,ativo:k.ativo!==false,municipioId:m.id,remessaId:old?.remessaId||null,codigo:old?.codigo||k.nucleo,nome:k.nucleo,etapa:old?.etapa||0,campos:old?.campos||{},checks:old?.checks||{},criterio:old?.criterio||{salarioMinimo:'1518,00',rendaMaxima:'5'},responsavel:names[k.responsavel_id]||'',origem:['ERP'],externo:{...old?.externo,kanbanId:k.id,erp:k.nucleo},prioridade:k.prioridade||'Normal',pendencia:text(k.pendencia),prazoSLA:text(k.sla_prazo),etapaProcesso:k.etapa_atual,etapaIniciadaEm:text(k.etapa_iniciada_em),observacaoInterna:text(k.observacao_interna),
      andamentos:nested('processos_kanban_andamentos','andamentos',{status:'status',operacional:'status_operacional',descricaoCliente:'descricao_cliente',observacao:'observacao_interna',previsao:'previsao',data:'data_atualizacao'},r=>({id:r.id,status:text(r.status),operacional:text(r.status_operacional),descricaoCliente:text(r.descricao_cliente),observacao:text(r.observacao_interna),previsao:text(r.previsao),data:r.data_atualizacao||r.created_at,por:r.origem||'ERP',origem:r.origem})),
      observacoes:nested('processos_kanban_observacoes','observacoes',{texto:'texto'},comment),
      historicoEtapas:group(base.processos_kanban_historico,'processo_id',k.id).map(r=>({id:r.id,de:r.etapa_anterior,para:r.etapa_nova,por:names[r.alterado_por]||'Equipe',observacao:text(r.observacao),data:r.created_at})),
    },{nome:'nucleo',prioridade:'prioridade',pendencia:'pendencia',prazoSLA:'sla_prazo',etapaProcesso:'etapa_atual',etapaIniciadaEm:'etapa_iniciada_em',observacaoInterna:'observacao_interna',responsavel:{column:'responsavel_id',encode:v=>base.profiles.find(p=>p.nome===v)?.id||null}},'processos_kanban');
  }));
  merge('setoresMeta',base.meta_setores.map(r=>bind('setoresMeta',r,{id:r.id,nome:r.nome,ativo:r.ativo},direct('nome,ativo'),'meta_setores')));
  merge('ordensServico',base.ordens_servico.map(r=>bind('ordensServico',r,{id:r.id,nome:r.nome,nucleoReferente:text(r.nucleo_referente),etapaAtual:text(r.etapa_atual),municipio:text(r.municipio),estado:text(r.estado),observacoes:text(r.observacoes),criadoEm:r.created_at,comentarios:group(base.ordem_servico_comentarios,'ordem_servico_id',r.id).map(comment)}, {nome:'nome',nucleoReferente:'nucleo_referente',etapaAtual:'etapa_atual',municipio:'municipio',estado:'estado',observacoes:'observacoes'},'ordens_servico')));
  const association = (type,id) => type === 'processo' ? {tipo:'nucleo',id:db.nucleos.find(n=>n.externo?.kanbanId===id)?.id||id} : {tipo:type,id};
  merge('metas',base.metas.map(r=>{
    const a=r.integracao_nucleo_id ? association('processo',r.integracao_nucleo_id) : association(r.associacao_tipo,r.associacao_id);
    return bind('metas',r,{id:r.id,erpId:r.id,titulo:r.titulo,observacoes:text(r.observacoes),semana_inicio:text(r.semana_inicio),prazo:text(r.prazo),status:r.status,setor:base.meta_setores.find(s=>s.id===r.setor_id)?.nome||'',associacao_tipo:a.tipo,associacao_id:a.id||'',nucleos:a.tipo==='nucleo'?[a.id]:[],criadoPor:uid(r.created_by),icone:text(r.icone),responsaveis:group(base.meta_responsaveis,'meta_id',r.id).map(x=>uid(x.usuario_id)),
      checklist:group(base.meta_checklist,'meta_id',r.id).map(x=>bind('checklist',x,{...x,concluido_por:names[x.concluido_por]||''},{titulo:'titulo',concluido:'concluido',concluido_em:'concluido_em'},'meta_checklist',{collection:'metas',id:r.id,field:'checklist'})),
      arquivos:[...group(base.meta_arquivos,'meta_id',r.id).map(x=>bind('arquivos',x,{id:x.id,nome:x.nome,tipo:x.mime_type,tamanho:Number(x.tamanho_bytes),chave:`erp-storage|documentos|${x.caminho_storage}`,por:names[x.enviado_por]||'Equipe',data:x.created_at},{},'meta_arquivos',{collection:'metas',id:r.id,field:'arquivos'})),...((db.metas||[]).find(m=>m.id===r.id)?.arquivos||[]).filter(a=>!a.chave?.startsWith('erp-storage|')&&!group(base.meta_arquivos,'meta_id',r.id).some(f=>f.id===a.id))],
      comentarios:group(base.meta_comentarios,'meta_id',r.id).map(comment),historico:group(base.meta_historico,'meta_id',r.id).map(x=>({id:x.id,acao:x.acao,descricao:text(x.descricao),autor:names[x.autor_id]||'Equipe',autorId:uid(x.autor_id),data:x.created_at})),
    },{...direct('titulo,observacoes,semana_inicio,prazo,status,icone'),setor:{column:'setor_id',encode:v=>base.meta_setores.find(s=>s.nome===v)?.id||null},},'metas');
  }));
  merge('planos',base.planos_trabalho.map(r=>{
    const project=base.projetos.find(p=>p.id===r.projeto_id);
    const m=db.municipios.find(m=>normalize(project?.nome||r.titulo).includes(normalize(m.nome)));
    return bind('planos',r,{id:r.id,projetoId:r.projeto_id||null,titulo:r.titulo,descricao:text(r.descricao),status:r.status,icone:text(r.icone),municipioId:m?.id||null,municipioNome:project?.nome||r.titulo,uf:m?.uf||'',criadoEm:r.created_at,documentos:(base.documentos||[]).filter(d=>(r.projeto_id && d.projeto_id===r.projeto_id)||group(base.etapas_plano,'plano_id',r.id).some(e=>e.id===d.etapa_plano_id)).map(d=>({id:d.id,nome:d.nome,tipo:d.mime_type,chave:`erp-storage|documentos|${d.caminho_storage}`})),
      etapas:group(base.etapas_plano,'plano_id',r.id).sort((a,b)=>a.ordem-b.ordem).map(e=>bind('etapas',e,{id:e.id,titulo:e.titulo,descricao:text(e.descricao),ordem:e.ordem,status:e.status,prioridade:e.prioridade,inicio:text(e.inicio_prazo),prazo:text(e.prazo),icone:text(e.icone),responsaveis:group(base.etapa_responsaveis,'etapa_id',e.id).map(x=>uid(x.usuario_id)),
        entregaveis:group(base.entregaveis,'etapa_id',e.id).map(x=>bind('entregaveis',x,{id:x.id,titulo:x.titulo,concluido:x.concluido,por:names[x.concluido_por]||'',em:text(x.concluido_em)},{titulo:'titulo',concluido:'concluido',em:'concluido_em'},'entregaveis',{collection:'planos',id:r.id,field:'etapas',childId:e.id,childField:'entregaveis'})),comentarios:group(base.comentarios_plano,'integracao_etapa_id',e.id).map(comment),
      },{...direct('titulo,descricao,ordem,prioridade,prazo,icone'),inicio:'inicio_prazo',status:'status'},'etapas_plano',{collection:'planos',id:r.id,field:'etapas'})),comentarios:group(base.comentarios_plano,'plano_id',r.id).map(comment),
    },{...direct('titulo,descricao,status,icone'),projetoId:'projeto_id'},'planos_trabalho');
  }));
  merge('agendas',base.erp_agendas.map(r=>bind('agendas',r,{id:r.id,nome:r.nome,cor:r.cor},direct('nome,cor'),'erp_agendas')));
  merge('eventos',base.erp_eventos.map(r=>bind('eventos',r,{id:r.id,titulo:r.titulo,descricao:r.descricao,inicio:r.inicio,fim:r.fim,agendaId:r.agenda_id||'',entidade:r.entidade_id?association(r.entidade_tipo,r.entidade_id):null,participantes:r.participantes.map(uid),publico:r.publico,cor:r.cor,status:r.status,criadoPor:uid(r.created_by),recorrencia:'nenhuma',serieERP:r.serie_id,respostas:Object.fromEntries(group(base.erp_evento_respostas,'evento_id',r.id).map(x=>[uid(x.usuario_id),x.resposta]))},{...direct('titulo,descricao,publico,cor,status'),inicio:{column:'inicio',encode:v=>new Date(v).toISOString()},fim:{column:'fim',encode:v=>new Date(v).toISOString()},agendaId:'agenda_id',participantes:{column:'participantes',encode:v=>v.map(rawUser)}},'erp_eventos')));
  merge('conversas',base.erp_conversas.filter(r=>!r.excluido_em).map(r=>bind('conversas',r,{id:r.id,tipo:r.tipo,titulo:r.titulo,entidade:r.entidade_id?association(r.entidade_tipo,r.entidade_id):null,participantes:r.participantes.map(uid),criadoPor:uid(r.created_by),exclusaoSolicitada:(()=>{const req=(base.erp_exclusoes_chat||[]).find(x=>x.conversa_id===r.id && x.status==='pendente');return req?{id:req.id,por:uid(req.solicitado_por),motivo:req.motivo,data:req.created_at}:null;})(),lidaPor:{},mensagens:group(base.erp_mensagens,'conversa_id',r.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(x=>bind('mensagens',x,{id:x.id,autorId:uid(x.autor_id),texto:x.texto,data:x.created_at,eventoId:x.evento_id,arquivoERP:x.arquivo_path?{caminho:x.arquivo_path,nome:x.arquivo_nome}:null},{texto:'texto',autorId:'autor_id',data:'created_at',eventoId:'evento_id',arquivoERP:'arquivo_path'},'erp_mensagens',{collection:'conversas',id:r.id,field:'mensagens'}))},direct('titulo,tipo'),'erp_conversas')));
  // Additional Integração data is additive and does not replace canonical columns.
  for (const e of base.integracao_complementos) {
    if (e.colecao==='config') { db[e.registro_id]=copy(e.dados.valor); continue; }
    if (!Array.isArray(db[e.colecao])) {if(tabelasProprias.includes(e._tabela)&& !['etapas','entregaveis','mensagens','checklist','arquivos'].includes(e.colecao))db[e.colecao]=[];else continue;}
    const current=db[e.colecao].find(x=>x.id===e.registro_id);
    if (!current) db[e.colecao].push({...copy(e.dados),id:e.registro_id,_compartilhado:true});
    else if(!bindings.some(b=>!b.parent && b.collection===e.colecao && b.id===e.registro_id)) {Object.assign(current,unirCampos(current,e.dados),{_compartilhado:true});if(e.colecao==='processos'){delete current._resumo;delete current._pendencias;delete current._campoCompleto;}}
  }
  return {db,bindings,base};
}

const at = (db,b) => {
  if (!b.parent) return (db[b.collection]||[]).find(x=>x.id===b.id);
  const p=(db[b.parent.collection]||[]).find(x=>x.id===b.parent.id);
  const list=b.parent.childId ? p?.[b.parent.field]?.find(x=>x.id===b.parent.childId)?.[b.parent.childField] : p?.[b.parent.field];
  return (list||[]).find(x=>x.id===b.id);
};
export function alteracoesCompartilhadas(before,after,state,actor) {
  const ops=[];
  for (const b of state.bindings) {
    if(b.parent && !(after[b.parent.collection]||[]).some(x=>x.id===b.parent.id)) continue;
    const old=at(before,b), next=at(after,b);
    if (!old || !next) {
      if(old && !next) {
        if(b.table==='erp_mensagens')throw new Error('Mensagens existentes são preservadas no histórico do ERP.');
        if(b.table==='erp_conversas') {if(!old.exclusaoSolicitada?.id)throw new Error('Solicite a exclusão da conversa antes de aprová-la.');ops.push({action:'decidir_exclusao',payload:{id:old.exclusaoSolicitada.id,status:'aprovado'}});}
        else if(b.table==='processos_kanban') ops.push({table:b.table,key:b.key,expected:b.row,changes:{excluido_erp:true}});
        else ops.push({table:b.table,key:b.key,expected:b.row,remove:true});
      }
      continue;
    }
    const changes={}, expected={};
    for (const [field,descriptor] of Object.entries(b.map)) {
      if(eq(fieldValue(old,field),fieldValue(next,field))) continue;
      const column=typeof descriptor==='string'?descriptor:descriptor.column;
      const val=typeof descriptor==='string'?nullText(fieldValue(next,field)):descriptor.encode(fieldValue(next,field));
      changes[column]=val; expected[column]=b.row[column]??null;
    }
    if(b.table==='metas' && (!eq(old.associacao_tipo,next.associacao_tipo)||!eq(old.associacao_id,next.associacao_id))) {
      Object.assign(changes,{associacao_tipo:next.associacao_tipo==='nucleo'?'avulsa':next.associacao_tipo,associacao_id:next.associacao_tipo==='nucleo'?null:nullText(next.associacao_id),integracao_nucleo_id:next.associacao_tipo==='nucleo'?(after.nucleos.find(n=>n.id===next.associacao_id)?.externo?.kanbanId||next.associacao_id):null});
      for(const k of ['associacao_tipo','associacao_id','integracao_nucleo_id']) expected[k]=b.row[k]??null;
    }
    if(b.table==='processos_kanban' && old.municipioId!==next.municipioId) {
      const m=after.municipios.find(x=>x.id===next.municipioId);
      if(!m)throw new Error('Município não encontrado.');
      Object.assign(changes,{municipio:m.nome,estado:m.uf});Object.assign(expected,{municipio:b.row.municipio,estado:b.row.estado});
    }
    if(Object.keys(changes).length) {
      if(b.table==='erp_agendas') ops.push({table:b.table,key:b.key,expected,changes});
      else if(b.table==='erp_eventos') {
        const rest={...changes};
        if('status' in rest && rest.status!=='ativo') { ops.push({action:'evento_status',payload:{id:b.row.id,status:rest.status},expected:{status:expected.status},table:b.table,key:b.key}); delete rest.status; }
        if('cor' in rest) { ops.push({action:'evento_cor',payload:{id:b.row.id,cor:rest.cor},expected:{cor:expected.cor},table:b.table,key:b.key}); delete rest.cor; }
        if(Object.keys(rest).length) ops.push({table:b.table,key:b.key,expected:Object.fromEntries(Object.keys(rest).map(k=>[k,expected[k]])),changes:rest});
      }
      else if(['erp_conversas','erp_mensagens'].includes(b.table)) throw new Error('O ERP não permite editar os dados desta conversa. A alteração local foi preservada para revisão.');
      else ops.push({table:b.table,key:b.key,expected,changes});
    }
  }
  const insert=(table,id,changes)=>ops.push({table,key:{id},insert:true,changes});
  const newItems=(a,b)=>(b||[]).filter(x=>!(a||[]).some(y=>y.id===x.id));
  const who=actor.erpRef||rawUser(actor.id), name=actor.nome;
  const link=e=> e ? {entidade_tipo:e.tipo==='nucleo'?'processo':e.tipo,entidade_id:after.nucleos.find(n=>n.id===e.id)?.externo?.kanbanId||e.id} : {};
  const requireUuid=id=> {if(!uuid(id)) throw new Error('Este cadastro local precisa ser vinculado antes de ser gravado no banco compartilhado. Os dados locais foram preservados.');return id;};
  // Um município sintético (só do kanban) vira o registro real do financeiro quando ele existe com o mesmo nome e UF.
  const municipioReal=id=>{ if(uuid(id))return id; const m=after.municipios.find(x=>x.id===id); const real=m&&after.municipios.find(x=>uuid(x.id)&&normalize(x.nome)===normalize(m.nome)&&(x.uf||'SC')===(m.uf||'SC')); return real?real.id:id; };
  // These are creations requested after loading, never an import of old local rows.
  for(const m of newItems(before.municipios,after.municipios).filter(m=>!String(m.id).startsWith('municipio_'))) insert('fin_receb_municipios',requireUuid(m.id),{nome:m.nome,uf:m.uf||'SC',prefixo:nullText(m.prefixo)});
  for(const r of newItems(before.remessas,after.remessas)) {
    const m=after.municipios.find(x=>x.id===r.municipioId);
    insert('fin_receb_remessas',requireUuid(r.id),{municipio_id:requireUuid(municipioReal(r.municipioId)),codigo:r.codigo||`${m?.prefixo||''}${String(r.numero).padStart(2,'0')}`,nome:r.titulo||'',data_emissao:nullText(r.criada)});
  }
  for(const r of newItems(before.processos,after.processos)) insert('fin_receb_clientes',requireUuid(r.id),{municipio_id:requireUuid(municipioReal(r.municipioId)),remessa_id:r.remessaId?requireUuid(r.remessaId):null,codigo:r.codigo||null,nome:r.requerente?.nome||'',cpf_cnpj:nullText(r.requerente?.tipoPessoa==='juridica'?r.requerente?.cnpj:r.requerente?.cpf),ativo:r.situacao!=='Inativo',...Object.fromEntries(Object.entries({valorTotal:'valor_global',entrada:'valor_entrada',parcelas:'numero_parcelas',valorParcela:'valor_parcela',diaVencimento:'dia_vencimento'}).filter(([k])=>r.comercial?.[k]!==undefined).map(([k,v])=>[v,decimal(r.comercial[k])])),primeiro_vencimento:nullText(r.comercial?.primeiroVencimento)});
  for(const n of after.nucleos||[]) {
    const prev=(before.nucleos||[]).find(x=>x.id===n.id);
    const id=n.externo?.kanbanId || n.id;
    if(!prev) { requireUuid(id); const m=after.municipios.find(x=>x.id===n.municipioId); insert('processos_kanban',id,{nucleo:n.nome||n.codigo,municipio:m?.nome||'',estado:m?.uf||'SC',etapa_atual:n.etapaProcesso||'Comercial',origem:'ERP',ativo:true}); }
    if(!uuid(id)) continue;
    for(const x of newItems(prev?.andamentos,n.andamentos)) insert('processos_kanban_andamentos',x.id,{processo_id:id,status:x.status,status_operacional:x.operacional,descricao_cliente:x.descricaoCliente,observacao_interna:x.observacao,previsao:nullText(x.previsao),data_atualizacao:text(x.data).slice(0,10)||null,origem:'ERP'});
    for(const x of newItems(prev?.observacoes,n.observacoes)) insert('processos_kanban_observacoes',x.id,{processo_id:id,autor_id:who,autor_nome:name,autor_setor:x.setor||actor.setor,texto:x.texto});
    for(const x of newItems(prev?.historicoEtapas,n.historicoEtapas)) insert('processos_kanban_historico',x.id,{processo_id:id,etapa_anterior:x.de,etapa_nova:x.para,alterado_por:who,observacao:x.observacao||''});
  }
  for(const s of newItems(before.setoresMeta,after.setoresMeta)) if(uuid(s.id)) insert('meta_setores',s.id,{nome:s.nome,ativo:s.ativo!==false,created_by:who});
  for(const m of after.metas||[]) {
    const prev=(before.metas||[]).find(x=>x.id===m.id);
    if(!prev) insert('metas',requireUuid(m.id),{titulo:m.titulo,observacoes:m.observacoes||'',semana_inicio:nullText(m.semana_inicio),prazo:nullText(m.prazo),status:m.status,setor_id:after.setoresMeta.find(s=>s.nome===m.setor && uuid(s.id))?.id||null,associacao_tipo:m.associacao_tipo==='nucleo'?'avulsa':m.associacao_tipo,associacao_id:m.associacao_tipo==='nucleo'?null:nullText(m.associacao_id),integracao_nucleo_id:m.associacao_tipo==='nucleo'?(after.nucleos.find(n=>n.id===m.associacao_id)?.externo?.kanbanId||m.associacao_id):null,created_by:who,icone:nullText(m.icone)});
    if(!uuid(m.id)) continue;
    const removed=(prev?.responsaveis||[]).filter(x=>!(m.responsaveis||[]).includes(x));
    for(const u of removed) ops.push({table:'meta_responsaveis',key:{meta_id:m.id,usuario_id:rawUser(u)},expected:{meta_id:m.id,usuario_id:rawUser(u)},remove:true});
    for(const u of (m.responsaveis||[]).filter(x=>!(prev?.responsaveis||[]).includes(x))) ops.push({table:'meta_responsaveis',key:{meta_id:m.id,usuario_id:rawUser(u)},insert:true,changes:{meta_id:m.id,usuario_id:rawUser(u)}});
    for(const x of newItems(prev?.checklist,m.checklist)) insert('meta_checklist',x.id,{meta_id:m.id,titulo:x.titulo,concluido:!!x.concluido,created_by:who});
    for(const x of newItems(prev?.comentarios,m.comentarios)) insert('meta_comentarios',x.id,{meta_id:m.id,autor_id:who,texto:x.texto});
    for(const x of newItems(prev?.historico,m.historico)) insert('meta_historico',x.id,{meta_id:m.id,meta_titulo:m.titulo,entidade_tipo:['ordem_servico','projeto','plano'].includes(m.associacao_tipo)?m.associacao_tipo:'avulsa',entidade_id:['ordem_servico','projeto','plano'].includes(m.associacao_tipo)?m.associacao_id:null,acao:x.acao,descricao:x.descricao||'',autor_id:who});
  }
  for(const o of after.ordensServico||[]) {
    const prev=(before.ordensServico||[]).find(x=>x.id===o.id);
    if(!prev) insert('ordens_servico',requireUuid(o.id),{nome:o.nome,nucleo_referente:o.nucleoReferente,etapa_atual:o.etapaAtual,municipio:o.municipio,estado:o.estado,observacoes:o.observacoes,created_by:who});
    if(uuid(o.id)) for(const x of newItems(prev?.comentarios,o.comentarios)) insert('ordem_servico_comentarios',x.id,{ordem_servico_id:o.id,autor_id:who,texto:x.texto});
  }
  for(const p of after.planos||[]) {
    const prev=(before.planos||[]).find(x=>x.id===p.id);
    if(!prev) insert('planos_trabalho',requireUuid(p.id),{titulo:p.titulo,descricao:p.descricao||'',status:p.status,projeto_id:p.projetoId||null,created_by:who});
    if(!uuid(p.id)) continue;
    for(const e of p.etapas||[]) {
      const old=prev?.etapas?.find(x=>x.id===e.id);
      if(!old) insert('etapas_plano',requireUuid(e.id),{plano_id:p.id,titulo:e.titulo,descricao:e.descricao||'',ordem:e.ordem,status:e.status,prioridade:e.prioridade,inicio_prazo:nullText(e.inicio),prazo:nullText(e.prazo),icone:nullText(e.icone)});
      for(const u of (old?.responsaveis||[]).filter(x=>!(e.responsaveis||[]).includes(x))) ops.push({table:'etapa_responsaveis',key:{etapa_id:e.id,usuario_id:rawUser(u)},expected:{etapa_id:e.id,usuario_id:rawUser(u)},remove:true});
      for(const u of (e.responsaveis||[]).filter(x=>!(old?.responsaveis||[]).includes(x))) ops.push({table:'etapa_responsaveis',key:{etapa_id:e.id,usuario_id:rawUser(u)},insert:true,changes:{etapa_id:e.id,usuario_id:rawUser(u)}});
      for(const x of newItems(old?.entregaveis,e.entregaveis)) insert('entregaveis',x.id,{etapa_id:e.id,titulo:x.titulo,concluido:!!x.concluido});
      // The extra nullable reference preserves the step without altering old plan-wide comments.
      for(const x of newItems(old?.comentarios,e.comentarios)) insert('comentarios_plano',x.id,{plano_id:p.id,integracao_etapa_id:e.id,autor_id:who,texto:x.texto});
    }
  }
  for(const a of newItems(before.agendas,after.agendas)) ops.push({action:'agenda',tempId:a.id,payload:{nome:a.nome,cor:a.cor}});
  for(const e of after.eventos||[]) {
    const prev=(before.eventos||[]).find(x=>x.id===e.id);
    if(!prev) ops.push({action:'evento',tempId:e.id,payload:{titulo:e.titulo,descricao:e.descricao,inicio:new Date(e.inicio).toISOString(),fim:new Date(e.fim).toISOString(),agenda_id:uuid(e.agendaId)?e.agendaId:null,participantes:e.participantes.map(rawUser),publico:e.publico,recorrencia:e.recorrencia||'nenhuma',repetir_ate:e.recorrenciaAte||null,...link(e.entidade)}});
    if(prev && !eq(prev.respostas?.[actor.id],e.respostas?.[actor.id])) ops.push({action:'resposta',payload:{id:e.id,resposta:e.respostas[actor.id]}});
  }
  for(const c of after.conversas||[]) {
    const prev=(before.conversas||[]).find(x=>x.id===c.id);
    if(!prev) ops.push({action:'conversa',tempId:c.id,payload:{tipo:c.tipo,titulo:c.titulo,participantes:c.participantes.map(rawUser),...link(['meta','ordem_servico'].includes(c.entidade?.tipo)?null:c.entidade)}});
    for(const x of newItems(prev?.mensagens,c.mensagens)) ops.push({action:'mensagem',tempId:x.id,payload:{conversa_id:c.id,texto:x.texto||'',evento_id:x.eventoId||null}});
    if(prev?.exclusaoSolicitada?.id && !c.exclusaoSolicitada) ops.push({action:'decidir_exclusao',payload:{id:prev.exclusaoSolicitada.id,status:'rejeitado'}});
    if(c.exclusaoSolicitada && !prev?.exclusaoSolicitada) ops.push({action:'exclusao',payload:{conversa_id:c.id,motivo:c.exclusaoSolicitada.motivo}});
  }
  return ops;
}

// Three-way merge: a remote refresh never overwrites an unsaved local edit.
export function mesclarEdicoes(base,local,remote) {
  if(eq(base,local)) return copy(remote);
  if(eq(base,remote) || eq(local,remote)) return copy(local);
  if(Array.isArray(base) && Array.isArray(local) && Array.isArray(remote) && [...base,...local,...remote].every(x=>x && typeof x==='object' && x.id)) {
    const ids=[...new Set([...remote,...local].map(x=>x.id))];
    return ids.flatMap(id=>{
      const b=base.find(x=>x.id===id),l=local.find(x=>x.id===id),r=remote.find(x=>x.id===id);
      if(!l && b) return [];
      if(!r) return l ? [copy(l)] : [];
      return [b && l ? mesclarEdicoes(b,l,r) : copy(l||r)];
    });
  }
  if(base && local && remote && !Array.isArray(local) && typeof local==='object') {
    return Object.fromEntries([...new Set([...Object.keys(remote),...Object.keys(local)])].filter(k=>k in local || !(k in base)).map(k=>[k,mesclarEdicoes(base[k],local[k],remote[k])]));
  }
  return copy(local);
}

export function complementos(before,after,state,actor) {
  const operations=[];
  const ignored=new Set(['_compartilhado','online','ultimaAtividade']);
  for(const collection of Object.keys(after)) {
    if(['previaERP','versao'].includes(collection)) continue;
    const array=Array.isArray(after[collection]) && after[collection].every(x=>x && typeof x==='object' && x.id);
    const records=array?(collection==='auditoria'?after[collection].filter(r=>!['Entrou no sistema','Saiu do sistema','Sessão encerrada por inatividade'].includes(r.acao)):after[collection]):[{id:collection,valor:after[collection]}];
    if(array && !['auditoria','notificacoes'].includes(collection)) for(const removed of (before[collection]||[]).filter(x=>!records.some(r=>r.id===x.id))) {
      const prior=state.base.integracao_complementos.find(x=>x.colecao===collection && x.registro_id===removed.id);
      if(prior) operations.push({table:prior._tabela||destinoComplemento(collection),key:{colecao:collection,registro_id:removed.id},expected:{dados:prior.dados},remove:true});
    }
    for(const r of records) {
      const old=array?(before[collection]||[]).find(x=>x.id===r.id):{id:collection,valor:before[collection]};
      if(eq(old,r)) continue;
      const b=state.bindings.find(b=>!b.parent && b.collection===collection && b.id===r.id);
      const excluded=new Set([...ignored,...Object.keys(b?.map||{}),...(b?nestedFields[collection]||[]:[])]);
      const prior=state.base.integracao_complementos.find(x=>x.colecao===(array?collection:'config') && x.registro_id===r.id);
      const data={...(prior?.dados||{})};
      const initialOwn=!b&&!prior;
      // Only fields edited in this action enter the complement; never cache shared columns.
      for(const field of new Set([...Object.keys(old||{}),...Object.keys(r)])) if(!excluded.has(field) && (initialOwn || !eq(old?.[field],r[field]))) {
        const sharedChildren=Object.keys(b?.map||{}).filter(path=>path.startsWith(`${field}.`)).map(path=>path.split('.')[1]);
        if(sharedChildren.length && r[field] && typeof r[field]==='object') {
          const values={...(data[field]||{})};
          for(const child of new Set([...Object.keys(old?.[field]||{}),...Object.keys(r[field])])) if(!sharedChildren.includes(child) && !eq(old?.[field]?.[child],r[field][child])) values[child]=copy(r[field][child]??null);
          if(Object.keys(values).length)data[field]=values;
        } else data[field]=copy(r[field]??null);
      }
      if(collection==='processos' && old?.situacao!==r.situacao && !['Ativo','Inativo'].includes(r.situacao))data.situacao=r.situacao;
      for(const path of Object.keys(b?.map||{}).filter(k=>k.includes('.'))) {
        const parts=path.split('.'),last=parts.pop();let target=data;
        for(const part of parts)target=target?.[part];
        if(target)delete target[last];
      }
      if(eq(data,prior?.dados||{})) continue;
      const key={colecao:array?collection:'config',registro_id:r.id};
      if(prior) operations.push({table:prior?._tabela||destinoComplemento(key.colecao),key,expected:{dados:prior.dados},changes:{dados:data,updated_at:new Date().toISOString()}});
      else {
        const parent=r.nucleoId?state.bindings.find(x=>x.collection==='nucleos' && x.id===r.nucleoId):null;
        operations.push({table:destinoComplemento(key.colecao),key,insert:true,changes:{dados:data,criado_por:actor.erpRef||rawUser(actor.id),referencia_tabela:b?.table||parent?.table||(destinoComplemento(key.colecao)==='integracao_configuracoes'?'integracao_config':null),referencia_id:b?.row.id||parent?.row.id||null}});
      }
    }
  }
  for(const b of state.bindings.filter(x=>x.parent)) {
    const old=at(before,b),r=at(after,b);if(!r||eq(old,r))continue;
    const prior=state.base.integracao_complementos.find(e=>e.colecao===b.collection && e.registro_id===b.id);
    const data={...(prior?.dados||{})};
    for(const field of new Set([...Object.keys(old||{}),...Object.keys(r)])) if(!['id',...Object.keys(b.map),'responsaveis','entregaveis','comentarios'].includes(field) && !eq(old?.[field],r[field])) data[field]=copy(r[field]??null);
    if(eq(data,prior?.dados||{}))continue;
    const parent=state.bindings.find(x=>!x.parent && x.collection===b.parent.collection && x.id===b.parent.id);
    const key={colecao:b.collection,registro_id:b.id};
    operations.push(prior?{table:prior?._tabela||destinoComplemento(key.colecao),key,expected:{dados:prior.dados},changes:{dados:data}}:{table:destinoComplemento(key.colecao),key,insert:true,changes:{dados:data,criado_por:actor.erpRef||rawUser(actor.id),referencia_tabela:parent?.table||null,referencia_id:parent?.row.id||null}});
  }
  return operations;
}
export function prepararEdicao(before,after,state,actor) {
  // Summaries are read-only facts, never candidates for inserts, updates or deletes.
  before={...before,processos:(before.processos||[]).filter(p=>!p._resumo)};
  after={...after,processos:(after.processos||[]).filter(p=>!p._resumo)};
  const canonical=alteracoesCompartilhadas(before,after,state,actor);
  // Newly created canonical rows need the same binding rules as existing rows.
  const projected=copy(state.base);
  for(const op of canonical) if(op.insert && op.key.id && projected[op.table]) projected[op.table].push({...op.changes,...op.key});
  for(const op of canonical)if(op.tempId) {
    if(op.action==='conversa')projected.erp_conversas.push({...op.payload,id:op.tempId,created_by:actor.erpRef});
    if(op.action==='mensagem')projected.erp_mensagens.push({...op.payload,id:op.tempId,autor_id:actor.erpRef,created_at:new Date().toISOString()});
    if(op.action==='agenda')projected.erp_agendas.push({...op.payload,id:op.tempId});
    if(op.action==='evento')projected.erp_eventos.push({...op.payload,id:op.tempId,created_by:actor.erpRef});
  }
  const extended=projetar(projected,after);
  const metadata={...state,bindings:[...state.bindings,...extended.bindings.filter(b=>!state.bindings.some(old=>old.table===b.table && old.id===b.id))]};
  const extras=complementos(before,after,metadata,actor);
  for(const op of extras) {if(op.insert && op.key.colecao==='conversas') {op.changes.referencia_tabela='erp_conversas';op.changes.referencia_id=op.key.registro_id;for(const k of ['tipo','titulo','participantes','mensagens','criadoPor'])delete op.changes.dados[k];}}
  return [...extras.filter(o=>o.remove),...canonical,...extras.filter(o=>!o.remove)];
}
export async function gravarOperacoes(operations,pedido) {
  if(!operations.length) return {aliases:{}};
  const result = await requisicao('rpc/integracao_gravar',{method:'POST',body:JSON.stringify({operacoes:operations,pedido})});
  if (operations.some(op => ['fin_receb_clientes','integracao_moradores','integracao_municipios','integracao_remessas','integracao_nucleos','integracao_complementos'].includes(op.table))) invalidarIndiceClientes();
  return result;
}

export async function lerArquivoERP(chave) {
  await requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'});
  const [,bucket,path]=chave.split('|');
  const r=await fetch(`${configERP.url}/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`,{headers:{apikey:configERP.chave,Authorization:`Bearer ${session.access_token}`}});
  if(!r.ok)throw new Error('Arquivo indisponível para esta conta.');
  const blob=await r.blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
}

// Immutable objects: replacing a template creates a new object and CAS-updates its pointer.
export async function conteudoStorage(path,bytes) {
  await requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'});
  const response=await fetch(`${configERP.url}/storage/v1/object/${bytes?'':'authenticated/'}integracao/${path.split('/').map(encodeURIComponent).join('/')}`,{method:bytes?'POST':'GET',headers:{apikey:configERP.chave,Authorization:`Bearer ${session.access_token}`,...(bytes?{'Content-Type':'text/plain;charset=utf-8','x-upsert':'false'}:{})},...(bytes?{body:bytes}:{})});
  if(bytes) {
    const result=await response.json();
    if(!response.ok && !['Duplicate','409'].includes(String(result.error||result.statusCode)))throw new Error(result.message||'Não foi possível guardar o arquivo no Supabase.');
    return path;
  }
  if(!response.ok)throw new Error('Arquivo indisponível para esta conta.');
  return response.text();
}

// Only files explicitly attached after loading are uploaded. Existing ERP files stay in place.
export async function prepararArquivos(before,after,storage,actor) {
  const operations=[];
  for(const m of after.metas||[]) for(const a of m.arquivos||[]) {
    if((before.metas||[]).find(x=>x.id===m.id)?.arquivos?.some(x=>x.id===a.id))continue;
    if(a.chave?.startsWith('erp-storage|'))continue;
    const data=await storage.get(a.chave);if(!data)throw new Error(`O arquivo ${a.nome} não está disponível neste aparelho. O rascunho foi preservado.`);
    const blob=await (await fetch(data)).blob();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
    const path=`${actor.erpRef}/metas/${m.id}/${a.id}-${digest}`;
    await requisicao('rpc/erp_collab_directory',{method:'POST',body:'{}'});
    const response=await fetch(`${configERP.url}/storage/v1/object/documentos/${path}`,{method:'POST',headers:{apikey:configERP.chave,Authorization:`Bearer ${session.access_token}`,'Content-Type':a.tipo||'application/octet-stream','x-upsert':'false'},body:blob});
    const result=await response.json();
    if(!response.ok && !['Duplicate','409'].includes(String(result.error||result.statusCode)))throw new Error(result.message||'Não foi possível enviar o arquivo.');
    operations.push({table:'meta_arquivos',key:{id:a.id},insert:true,changes:{meta_id:m.id,nome:a.nome,caminho_storage:path,mime_type:a.tipo||null,tamanho_bytes:blob.size,enviado_por:actor.erpRef}});
  }
  return operations;
}

// Reuse the directory across modal mounts; never persist it outside this session.
export function lerIndiceClientes() {
  if (!session) return Promise.reject(new Error('Entre novamente para buscar clientes.'));
  if (indiceClientes && Date.now() - indiceCarregadoEm < VALIDADE_INDICE_MS) return Promise.resolve(indiceClientes);
  if (indiceJob) return indiceJob;
  const geracao = indiceGeracao;
  const job = carregarIndiceClientes().then(result => {
    if (geracao !== indiceGeracao) throw new Error('Os dados da busca mudaram. Tente novamente.');
    indiceClientes = result; indiceCarregadoEm = Date.now();
    return result;
  }).finally(() => { if (indiceJob === job) indiceJob = null; });
  indiceJob = job;
  return job;
}
async function carregarIndiceClientes() {
  const clientesJob = lerTabela('fin_receb_clientes', 'id,nome,codigo,municipio_id,remessa_id');
  const complementosJob = (async () => {
    const rows = [];
    // Explicit JSON projections avoid downloading documents, CPF or financial data.
    const select = 'registro_id,referencia_id,nome:dados->requerente->>nome,tipoPessoa:dados->requerente->>tipoPessoa,municipioId:dados->>municipioId,remessaId:dados->>remessaId,nucleoId:dados->>nucleoId,codigo:dados->>codigo,arquivamento:dados->extras->arquivamento';
    for (let offset = 0; ; offset += 500) {
      const page = await requisicao(`integracao_moradores?select=${encodeURIComponent(select)}&colecao=eq.processos&order=registro_id&limit=500&offset=${offset}`);
      rows.push(...page.map(e => ({registro_id:e.registro_id, referencia_id:e.referencia_id, dados:{municipioId:e.municipioId, remessaId:e.remessaId, nucleoId:e.nucleoId, codigo:e.codigo, extras:{arquivamento:e.arquivamento}, requerente:{nome:e.nome, tipoPessoa:e.tipoPessoa}}})));
      if (page.length < 500) return rows;
    }
  })();
  const [clientes, complementos] = await Promise.all([clientesJob, complementosJob]);
  return {clientes, complementos};
}

export async function lerFichaCliente(cliente) {
  const filtro = cliente.financeiroRef ? `referencia_id=eq.${encodeURIComponent(cliente.financeiroRef)}` : `registro_id=eq.${encodeURIComponent(cliente.id)}`;
  const [clientes, complementos] = await Promise.all([
    cliente.financeiroRef ? lerTabela('fin_receb_clientes', '*', `&id=eq.${encodeURIComponent(cliente.financeiroRef)}`) : [],
    requisicao(`integracao_moradores?colecao=eq.processos&${filtro}`),
  ]);
  if (!clientes.length && !complementos.length) throw new Error('Cliente indisponível para esta conta.');
  return {clientes, complementos};
}

export async function analisarMatriculaNUI(arquivo){
 if(!session)throw new Error('Entre novamente para analisar a matrícula.');
 if(arquivo.size>3*1024*1024)throw new Error('Envie PDF, PNG ou JPG de até 3 MB. Divida documentos maiores.');
 if(!['application/pdf','image/png','image/jpeg'].includes(arquivo.type))throw new Error('Formato aceito: PDF, PNG ou JPG.');
 await requisicao('profiles?select=id&id=eq.'+encodeURIComponent(session.user.id));
 const data=await new Promise((ok,erro)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=()=>erro(new Error('Não foi possível ler o arquivo.'));r.readAsDataURL(arquivo);});
 const response=await fetch('/api/ler-matricula',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({arquivo:arquivo.name,mime:arquivo.type,base64:data}),signal:AbortSignal.timeout(290000)});
 const result=await response.json();if(!response.ok)throw new Error(result.message||'Falha na análise.');return result;
}
