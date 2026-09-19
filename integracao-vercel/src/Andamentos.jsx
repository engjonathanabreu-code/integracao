import {useState} from 'react';
import {CalendarDays, Plus, Search, History, Sparkles} from 'lucide-react';
import {listarCRM,criarCRM,editarCRM} from './crm-api.js';
import {acessoCRM} from './crm-regras.js';
import {useModulo,EstadoModulo,CampoCRM} from './modulo-ui.jsx';
import {referenciaNucleo,etapaDoAndamento} from './processo-etapas.js';
import './andamentos.css';
const dataBR = value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
const campos = ['id','processo_id','status','descricao_cliente','observacao_interna','previsao','orientacao_ia','visivel_ia','data_atualizacao'];
export default function Andamentos({db,usuario}) {
 const acesso=acessoCRM(usuario);
 const [nucleo,setNucleo]=useState(''),[form,setForm]=useState(null),[busca,setBusca]=useState('');
 const [instrucao,setInstrucao]=useState(''),[habilitado,setHabilitado]=useState(false),[promptAberto,setPromptAberto]=useState(false);
 const m=useModulo(async()=>{const [itens,prompts]=await Promise.all([listarCRM('processos_kanban_andamentos'),acesso.pos?listarCRM('integracao_nucleo_ia'):Promise.resolve([])]);return {itens,prompts};},[usuario?.id]);
 const nome=id=>{const n=db.nucleos.find(n=>referenciaNucleo(n)===id);return n?(n.nome?.startsWith(n.codigo)?n.nome:[n.codigo,n.nome].filter(Boolean).join(' · ')):'Núcleo';};
 const etapa=id=>etapaDoAndamento(db.nucleos,id);
 const opcoes=db.nucleos.map(n=><option key={n.id} value={referenciaNucleo(n)}>{nome(referenciaNucleo(n))}</option>);
 const novo=()=>{setPromptAberto(false);setForm({processo_id:nucleo,descricao_cliente:'',observacao_interna:'',previsao:'',orientacao_ia:'',visivel_ia:false,data_atualizacao:new Date().toLocaleDateString('en-CA')});};
 const itens=(m.dados?.itens||[]).filter(a=>(!nucleo||a.processo_id===nucleo)&&`${nome(a.processo_id)} ${a.descricao_cliente||''} ${a.status||''}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'))).sort((a,b)=>String(b.data_atualizacao).localeCompare(String(a.data_atualizacao)));
 async function salvar(e) {
  e.preventDefault();
  const {id,...data}=form;
  data.status=id?form.status:etapa(form.processo_id);
  if(!data.status)return;
  data.previsao||=null;
  if(await m.executar(()=>id?editarCRM('processos_kanban_andamentos',id,data):criarCRM('processos_kanban_andamentos',{...data,origem:'Integração'})))setForm(null);
 }
 return <div className="contem largo andamentos-pagina">
  <header className="andamentos-cabeca"><div><span className="andamentos-eyebrow"><History size={16}/> PROCESSOS E NÚCLEOS</span><h1>Andamentos</h1><p>Acompanhe a evolução dos núcleos e as informações disponíveis para atendimento.</p></div>{acesso.pos&&<button className="btn btn-primario" onClick={novo}><Plus size={17}/>Registrar andamento</button>}</header>
  <EstadoModulo modulo={m}/>
  <section className="andamentos-filtros">
   <CampoCRM nome="Núcleo"><select className="inp" value={nucleo} onChange={e=>{setNucleo(e.target.value);setPromptAberto(false);if(form&&!form.id)setForm({...form,processo_id:e.target.value});}}><option value="">Todos os núcleos</option>{opcoes}</select></CampoCRM>
   <CampoCRM nome="Buscar no histórico"><div className="andamentos-busca"><Search size={17}/><input className="inp" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Descrição, núcleo ou etapa"/></div></CampoCRM>
   {nucleo&&<div className="andamentos-contexto"><div><span className="andamentos-eyebrow">ETAPA ATUAL DO NÚCLEO</span><strong>{etapa(nucleo)}</strong><small>Mesma etapa do cadastro e do Kanban.</small></div>{acesso.pos&&<button className="btn" disabled={!m.dados} onClick={()=>{const p=m.dados?.prompts.find(p=>p.id===nucleo);setInstrucao(p?.instrucao||'');setHabilitado(p?.habilitado||false);setPromptAberto(!promptAberto);}}><Sparkles size={16}/>Instruções da IA</button>}</div>}
  </section>
  {promptAberto&&acesso.pos&&<form className="andamentos-editor" onSubmit={async e=>{e.preventDefault();if(await m.executar(()=>m.dados.prompts.some(p=>p.id===nucleo)?editarCRM('integracao_nucleo_ia',nucleo,{instrucao,habilitado}):criarCRM('integracao_nucleo_ia',{id:nucleo,instrucao,habilitado})))setPromptAberto(false);}}><h2>Instruções da IA · {nome(nucleo)}</h2><CampoCRM nome="Instrução específica de atendimento"><textarea className="inp" rows={4} value={instrucao} onChange={e=>setInstrucao(e.target.value)}/></CampoCRM><label><input type="checkbox" checked={habilitado} onChange={e=>setHabilitado(e.target.checked)}/> Autorizar consulta de andamentos pela IA</label><p>Somente descrições autorizadas são disponibilizadas. Observações internas ficam fora da resposta.</p><div className="crm-acoes"><button className="btn btn-primario" disabled={m.ocupado||!m.dados}>Salvar instruções</button><button type="button" className="btn" onClick={()=>setPromptAberto(false)}>Fechar</button></div></form>}
  {form&&acesso.pos&&<form className="andamentos-editor" onSubmit={salvar}><div className="andamentos-editor-titulo"><h2>{form.id?'Editar':'Registrar'} andamento</h2><button className="btn" type="button" onClick={()=>setForm(null)}>Cancelar</button></div><div className="andamentos-form-grid"><CampoCRM nome="Núcleo"><select className="inp" required disabled={!!form.id} value={form.processo_id} onChange={e=>setForm({...form,processo_id:e.target.value})}><option value="">Selecione</option>{opcoes}</select></CampoCRM><CampoCRM nome={form.id?'Etapa registrada no histórico':'Etapa atual do núcleo'}><input className="inp" readOnly value={form.id?form.status||'':etapa(form.processo_id)} placeholder="Selecione um núcleo"/></CampoCRM>{[['data_atualizacao','Data do andamento'],['previsao','Previsão']].map(([k,label])=><CampoCRM nome={label} key={k}><input className="inp" type="date" required={k==='data_atualizacao'} value={String(form[k]||'').slice(0,10)} onChange={e=>setForm({...form,[k]:e.target.value})}/></CampoCRM>)}</div><CampoCRM nome="Descrição autorizada ao cliente"><textarea className="inp" rows={4} required value={form.descricao_cliente||''} onChange={e=>setForm({...form,descricao_cliente:e.target.value})} placeholder="Descreva o progresso e os próximos passos com clareza."/></CampoCRM><div className="andamentos-form-grid">{[['observacao_interna','Observação interna'],['orientacao_ia','Orientação da IA para este andamento']].map(([k,label])=><CampoCRM key={k} nome={label}><textarea className="inp" rows={3} value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})}/></CampoCRM>)}</div><label className="andamentos-autorizacao"><input type="checkbox" checked={!!form.visivel_ia} onChange={e=>setForm({...form,visivel_ia:e.target.checked})}/> Visível para a IA de atendimento</label><button className="btn btn-primario" disabled={m.ocupado||!form.processo_id}>Salvar andamento</button></form>}
  <div className="andamentos-historico-titulo"><h2>Histórico de andamentos</h2><span>{itens.length} registro(s) · mais recentes primeiro</span></div>
  {m.dados&&!itens.length&&<div className="andamentos-vazio"><History size={30}/><h3>Nenhum andamento encontrado</h3><p>Selecione outro núcleo ou registre o primeiro andamento.</p></div>}
  <div className="andamentos-lista">{itens.map(a=><article className="andamentos-item" key={a.id}><div className="andamentos-data"><CalendarDays size={18}/><time>{dataBR(a.data_atualizacao)}</time></div><div className="andamentos-corpo"><div className="andamentos-item-topo"><h3>{nome(a.processo_id)}</h3><span className="andamentos-etapa">{a.status||'Etapa não informada'}</span></div><p className="andamentos-descricao">{a.descricao_cliente||'Sem descrição.'}</p><div className="andamentos-metadados">{a.previsao&&<span>Previsão: {dataBR(a.previsao)}</span>}<span className={a.visivel_ia?'andamentos-ia-autorizada':''}>{a.visivel_ia?'Disponível para atendimento IA':'Não autorizado para IA'}</span></div>{acesso.pos&&(a.observacao_interna||a.orientacao_ia)&&<details className="andamentos-interno"><summary>Notas internas e orientação da IA</summary>{a.observacao_interna&&<p><strong>Observação interna</strong>{a.observacao_interna}</p>}{a.orientacao_ia&&<p><strong>Orientação da IA</strong>{a.orientacao_ia}</p>}</details>}{acesso.pos&&<button className="btn btn-sm" onClick={()=>setForm(Object.fromEntries(campos.map(k=>[k,a[k]])))}>Editar andamento</button>}</div></article>)}</div>
 </div>;
}
