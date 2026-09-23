import FollowUpCRM,{ResumoFollowUp,ResumoChatwoot} from './FollowUpCRM.jsx';
import InstitucionaisCRM from './InstitucionaisCRM.jsx';
import DashboardCRM from './DashboardCRM.jsx';
import {EditarComerciaisLead,responsaveisLead} from './ComerciaisLead.jsx';
import {CadastrarLead} from './LeadCRM.jsx';
import NegociacaoCRM from './NegociacaoCRM.jsx';
import {salvarNegociacaoCRM} from './crm-api.js';
import {useState,useEffect,useRef} from 'react';
import {X,Phone,FileText,MapPin,Layers,MessageSquare,ListTodo,Filter,UserPlus,UserX,BarChart3,Building2} from 'lucide-react';
import {listarCRM,criarCRM,editarCRM,rpcCRM} from './crm-api.js';
import {ETAPAS_CRM,acessoCRM,normalizarCRM} from './crm-regras.js';
import './crm.css';
import {BuscaClientes} from './BuscaClientes.jsx';
import AgentesChatwoot from './AgentesChatwoot.jsx';
import {useModulo,EstadoModulo,CampoCRM} from './modulo-ui.jsx';
const nomeCard=c=>c.nome||c.lead_nome||'Contato';
const visoesFunil=[['reduzido','Reduzido'],['semi','Semi'],['detalhada','Detalhada']];
function lerVisaoFunil(chave){try{const valor=localStorage.getItem(chave);return visoesFunil.some(([id])=>id===valor)?valor:'detalhada';}catch{return 'detalhada';}}


function RegistroForm({tipo,card,onSalvar,onCancelar,ocupado}) {
  const [texto,setTexto]=useState(''),[data,setData]=useState(new Date().toLocaleDateString('en-CA')),[itens,setItens]=useState('');
  return <form className="crm-form" onSubmit={e=>{e.preventDefault();onSalvar(tipo==='tarefa'?{card_id:card.id,titulo:texto,prazo:data,checklist:itens.split('\n').map(x=>x.trim()).filter(Boolean).map(texto=>({texto,concluido:false}))}:{card_id:card.id,relato:texto,data:new Date(`${data}T12:00:00`).toISOString()});}}>
    <h3>{tipo==='tarefa'?'Registrar tarefa':'Registrar atendimento'} · {nomeCard(card)}</h3>
    <CampoCRM nome={tipo==='tarefa'?'Prazo':'Data do atendimento'}><input className="inp" type="date" required value={data} onChange={e=>setData(e.target.value)}/></CampoCRM>
    <CampoCRM nome={tipo==='tarefa'?'Item a cumprir':'Relato do atendimento'}><textarea className="inp" required value={texto} onChange={e=>setTexto(e.target.value)} /></CampoCRM>
    {tipo==='tarefa'&&<CampoCRM nome="Checklist (um item por linha)"><textarea className="inp" value={itens} onChange={e=>setItens(e.target.value)}/></CampoCRM>}
    <div className="crm-acoes"><button className="btn btn-primario" disabled={ocupado||!texto.trim()}>Salvar</button><button className="btn" type="button" onClick={onCancelar}>Cancelar</button></div>
  </form>;
}

export function HistoricoAtendimento({cardId,clienteId,usuario}) {
  const acesso=acessoCRM(usuario);
  const m=useModulo(async()=>{
    if(!acesso.comercial)return {atendimentos:[],conversas:[],mensagens:[]};
    let ids=cardId?[cardId]:(await listarCRM('integracao_crm_cards',`&cliente_id=eq.${encodeURIComponent(clienteId)}`)).map(c=>c.id);
    if(!ids.length)return {atendimentos:[],conversas:[],mensagens:[]};
    const filtro=`&card_id=in.(${ids.join(',')})`;
    const [atendimentos,conversas]=await Promise.all([listarCRM('integracao_crm_atendimentos',filtro),listarCRM('integracao_crm_conversas',filtro)]);
    const mensagens=conversas.length?await listarCRM('integracao_crm_mensagens',`&conversa_id=in.(${conversas.map(c=>c.id).join(',')})`):[];
    return {atendimentos,conversas,mensagens};
  },[cardId,clienteId,usuario?.id],['crm','clientes']);
  if(!acesso.comercial)return <p>O histórico de atendimento está disponível ao comercial responsável e à administração.</p>;
  return <section className="crm-painel"><h2>Atendimentos e conversas</h2><EstadoModulo modulo={m}/>{m.dados&&<>
    {!m.dados.atendimentos.length&&!m.dados.mensagens.length&&<p>Nenhum atendimento disponível para este cliente.</p>}
    {[...m.dados.atendimentos.map(a=>({...a,conteudo:a.relato,autor:'Atendimento manual'})),...m.dados.mensagens].sort((a,b)=>String(b.data).localeCompare(String(a.data))).map(x=><article className="crm-mensagem" key={x.id}><strong>{x.autor||'Equipe'}{x.privada?' · Nota interna':''}</strong><div className="ajuda">{new Date(x.data).toLocaleString('pt-BR')}</div><p>{x.conteudo}</p>{(x.anexos||[]).map((a,i)=><span key={i}>Anexo: {a.nome||a.file_type||'arquivo'}{a.url&&/^https:\/\//.test(a.url)?<> · <a href={a.url} target="_blank" rel="noreferrer">Abrir</a></>:null}</span>)}</article>)}
  </>}</section>;
}

function FichaCliente({titulo,fechar,children,compacta=false,ocupado=false}) {
 const ref=useRef(null);
 useEffect(()=>{const d=ref.current;d.showModal();return()=>d.close();},[]);
 return <dialog ref={ref} className={`crm-ficha-dialogo${compacta?' crm-lead-dialogo':''}`} aria-label={titulo} onCancel={e=>{e.preventDefault();if(!ocupado)fechar();}}><button className="btn crm-ficha-fechar" aria-label={compacta?"Fechar cadastro":"Fechar ficha"} disabled={ocupado} onClick={fechar}><X size={20}/></button>{children}</dialog>;
}
export default function CRM({usuario,db,ir,abrirCliente}) {
  const chaveVisao=`integracao-crm-visao-v1:${usuario.erpRef||usuario.id}`;
  const [preferenciaVisao,setPreferenciaVisao]=useState(()=>({chave:chaveVisao,modo:lerVisaoFunil(chaveVisao)}));
  const visao=preferenciaVisao.chave===chaveVisao?preferenciaVisao.modo:lerVisaoFunil(chaveVisao);
  const escolherVisao=modo=>{setPreferenciaVisao({chave:chaveVisao,modo});try{localStorage.setItem(chaveVisao,modo);}catch{/* A escolha continua disponível nesta sessão. */}};
  const [novoLead,setNovoLead]=useState(false);
  const [comerciaisLead,setComerciaisLead]=useState(null),[erroComerciais,setErroComerciais]=useState('');
  const editarComerciais=c=>{setSelecionado(null);setForm(null);setErroComerciais('');setComerciaisLead(c);};
  const [avisoLead,setAvisoLead]=useState('');
  const [selecionado,setSelecionado]=useState(null),[versaoHistorico,setVersaoHistorico]=useState(0);
  const [vinculo,setVinculo]=useState(null),[clienteEscolhido,setClienteEscolhido]=useState(null);
  const acesso=acessoCRM(usuario),[aba,setAba]=useState('funil'),[busca,setBusca]=useState(''),[responsavel,setResponsavel]=useState(''),[form,setForm]=useState(null),[historico,setHistorico]=useState(null),[transferencia,setTransferencia]=useState(null);
  const m=useModulo(async()=>{
    if(!acesso.comercial)return {cards:[],tarefas:[]};
    const [cards,tarefas,followups,chatwoot]=await Promise.all([listarCRM('integracao_crm_funil'),listarCRM('integracao_crm_tarefas','&concluida=eq.false'),listarCRM('integracao_crm_followups','&status=eq.pendente'),listarCRM('integracao_crm_chatwoot_resumo')]);
    return {cards,tarefas,followups,chatwoot};
  },[usuario?.id],['crm','clientes','usuarios']);
  if(!acesso.comercial)return <div className="contem"><h1>CRM</h1><p>Acesso restrito ao Comercial e à administração.</p></div>;
  const comerciais=db.usuarios.filter(u=>u.ativo&&u.tipoERP==='Comercial');
  const cards=(m.dados?.cards||[]).filter(c=>c.origem!=='vinculado'&&(!responsavel||responsaveisLead(c).includes(responsavel))&&normalizarCRM([nomeCard(c),c.cpf_cnpj,c.telefone,c.lead_telefone,c.municipio,c.lead_cidade].join(' ')).includes(normalizarCRM(busca)));
  const salvar=async dados=>{if(await m.executar(()=>criarCRM(form.tipo==='tarefa'?'integracao_crm_tarefas':'integracao_crm_atendimentos',dados))){setForm(null);setVersaoHistorico(v=>v+1);}};
  const nucleoCard=c=>{if(!c.nucleo_id)return '';const n=db.nucleos.find(n=>n.id===c.nucleo_id||n.externo?.kanbanId===c.nucleo_id);return n?[n.codigo,n.nome!==n.codigo?n.nome:''].filter(Boolean).join(' · '):'Núcleo vinculado';};
  const abrirFicha=(c,tipo=null)=>{setSelecionado(c);setForm(tipo?{tipo,card:c}:null);setHistorico(null);setTransferencia(null);setVinculo(null);};
  const atual=selecionado&&(m.dados?.cards.find(c=>c.id===selecionado.id)||selecionado);
  const followupCard=c=><ResumoFollowUp pendente={m.dados?.followups.find(f=>f.card_id===c.id)} abrir={()=>abrirFicha(c,'followup')}/>;
  const chatwootCard=c=><ResumoChatwoot resumo={m.dados?.chatwoot.find(r=>r.card_id===c.id)}/>;
  const statusCard=c=><NegociacaoCRM key={c.id} card={c} ocupado={m.ocupado} onSalvar={(dados,anterior)=>m.executar(()=>salvarNegociacaoCRM(c.id,dados,anterior))} onConverter={fn=>m.executar(fn)}/>;
  const dadosCard=c=><dl className="crm-ficha-dados"><div><dt><FileText size={14}/> CPF</dt><dd>{c.cpf_cnpj||'Não informado'}</dd></div><div><dt><Phone size={14}/> Telefone</dt><dd>{c.telefone||c.lead_telefone||'Não informado'}</dd></div><div><dt><MapPin size={14}/> Município</dt><dd>{c.municipio||c.lead_cidade||'Não informado'}</dd></div><div><dt><Layers size={14}/> Remessa</dt><dd>{c.remessa||'Não informada'}</dd></div>{c.nucleo_id&&<div><dt>Núcleo</dt><dd>{nucleoCard(c)}</dd></div>}</dl>;
  const card=c=><article className="crm-card crm-cliente-card" key={c.id}><button className="crm-cliente-abrir" aria-label={`Abrir ficha de ${nomeCard(c)}`} onClick={()=>abrirFicha(c)}><span className="crm-ficha-legenda">{c.municipio||c.lead_cidade||'Município não informado'}</span><h3>{nomeCard(c)}</h3></button>{dadosCard(c)}{statusCard(c)}{followupCard(c)}{chatwootCard(c)}<div className="crm-cliente-botoes"><button className="btn btn-sm" onClick={()=>abrirFicha(c,'atendimento')}><MessageSquare size={14}/> Registrar atendimento</button><button className="btn btn-sm" onClick={()=>abrirFicha(c,'tarefa')}><ListTodo size={14}/> Registrar tarefa</button><button className="btn btn-sm" onClick={()=>abrirFicha(c)}>Abrir ficha</button>{!c.cliente_id&&<button className="btn btn-sm" onClick={()=>editarComerciais(c)}>Comerciais responsáveis ({responsaveisLead(c).length})</button>}</div></article>;
  return <div className="contem largo"><div className="cabeca"><div><h1>CRM</h1><p>Relacionamento, atendimentos e próximos passos.</p></div>{aba!=='institucionais'&&<button className="btn btn-primario" onClick={()=>setNovoLead(true)}><UserPlus size={17}/>Cadastrar lead</button>}</div>
    <div className="crm-nav">{[['funil','Funil comercial',Filter],['leads','Potenciais leads',UserPlus],['institucionais','Clientes institucionais',Building2],['tarefas','Tarefas abertas',ListTodo],['perdidos','Perdidos',UserX],...(acesso.admin?[['dashboard','Dashboard comercial',BarChart3]]:[])].map(([id,nome,Icone])=><button key={id} className={`btn ${aba===id?'btn-primario':''}`} onClick={()=>{setAba(id);setHistorico(null);setForm(null);}}><Icone size={17} aria-hidden="true"/>{nome}</button>)}</div>
    {!['dashboard','institucionais'].includes(aba)&&<div className="crm-acoes"><input className="inp" aria-label="Buscar no CRM" placeholder="Nome, CPF, telefone ou município" value={busca} onChange={e=>setBusca(e.target.value)}/>{acesso.admin&&<select className="inp" aria-label="Filtrar comercial" value={responsavel} onChange={e=>setResponsavel(e.target.value)}><option value="">Todos os comerciais</option>{comerciais.map(u=><option key={u.id} value={u.erpRef}>{u.nome}</option>)}</select>}</div>}
    {aba==='funil'&&<div className="crm-visoes" role="group" aria-label="Visualização do funil"><span>Visualização</span>{visoesFunil.map(([id,nome])=><button key={id} className={`btn btn-sm${visao===id?' btn-primario':''}`} aria-pressed={visao===id} onClick={()=>escolherVisao(id)}>{nome}</button>)}</div>}
    <EstadoModulo modulo={m}/>
    {avisoLead&&<p role="status" className="ajuda">{avisoLead}</p>}
    {comerciaisLead&&<FichaCliente titulo="Comerciais do lead" compacta ocupado={m.ocupado} fechar={()=>setComerciaisLead(null)}><EditarComerciaisLead card={comerciaisLead} comerciais={comerciais} ocupado={m.ocupado} erro={erroComerciais} cancelar={()=>setComerciaisLead(null)} salvar={async(novos,anteriores)=>{setErroComerciais('');if(await m.executar(async()=>{try{await rpcCRM('integracao_crm_definir_comerciais',{p_card:comerciaisLead.id,p_responsaveis:novos,p_anteriores:anteriores});}catch(e){setErroComerciais(e.message);m.atualizar();throw e;}})){setComerciaisLead(null);setAvisoLead('Responsáveis do lead atualizados.');}}}/></FichaCliente>}
    {novoLead&&<FichaCliente titulo="Cadastrar lead" compacta ocupado={m.ocupado} fechar={()=>setNovoLead(false)}><CadastrarLead erro={m.erro} comerciais={comerciais} usuario={usuario} ocupado={m.ocupado} cancelar={()=>setNovoLead(false)} salvar={async dados=>{if(await m.executar(()=>rpcCRM('integracao_crm_cadastrar_lead_compartilhado',dados))){setAvisoLead(`Lead cadastrado para ${comerciais.filter(u=>dados.p_responsaveis.includes(u.erpRef)).map(u=>u.nome).join(', ')}. Ele aparecerá no funil dos responsáveis selecionados.`);setNovoLead(false);setAba('funil');}}}/></FichaCliente>}
    {acesso.admin&&<details className="crm-painel"><summary>Configurar agentes do Chatwoot</summary><AgentesChatwoot usuario={usuario} db={db}/></details>}
    {vinculo&&<section className="crm-card"><h2>Confirmar identidade de {nomeCard(vinculo)}</h2><p>Confira o titular com o contato antes de vincular o histórico. O cadastro existente será preservado.</p><BuscaClientes db={db} abrirCliente={async p=>setClienteEscolhido(p)}/>{clienteEscolhido&&<><p>Selecionado: {clienteEscolhido.codigo} · {clienteEscolhido.requerente?.nome}</p><button className="btn btn-primario" disabled={m.ocupado} onClick={async()=>{if(await m.executar(()=>rpcCRM('integracao_crm_vincular',{card:vinculo.id,cliente:clienteEscolhido.financeiroRef||clienteEscolhido.id})))setVinculo(null);}}>Identidade conferida — vincular</button></>}<button className="btn" onClick={()=>setVinculo(null)}>Cancelar</button></section>}
    {form&&form.tipo!=='followup'&&!atual&&<RegistroForm key={`${form.tipo}${form.card.id}`} {...form} ocupado={m.ocupado} onSalvar={salvar} onCancelar={()=>setForm(null)}/>}
    {transferencia&&<form className="crm-form" onSubmit={async e=>{e.preventDefault();if(await m.executar(()=>rpcCRM('integracao_crm_transferir',{card:transferencia.card.id,destino:transferencia.destino})))setTransferencia(null);}}><h3>Transferir {nomeCard(transferencia.card)}</h3><p>Esta transferência substitui todos os responsáveis pelo comercial escolhido. O histórico acompanha o cliente; tarefas existentes continuam com seus responsáveis.</p><select className="inp" required aria-label="Novo responsável" value={transferencia.destino} onChange={e=>setTransferencia(t=>({...t,destino:e.target.value}))}><option value="">Escolha um comercial</option>{comerciais.map(u=><option key={u.id} value={u.erpRef}>{u.nome}</option>)}</select><div className="crm-acoes"><button className="btn btn-primario" disabled={m.ocupado}>Confirmar transferência</button><button className="btn" type="button" onClick={()=>setTransferencia(null)}>Cancelar</button></div></form>}
    {historico&&<><button className="btn" onClick={()=>setHistorico(null)}>Fechar histórico</button><HistoricoAtendimento cardId={historico.id} usuario={usuario}/></>}
    {atual&&<FichaCliente titulo={`Ficha de ${nomeCard(atual)}`} fechar={()=>{setSelecionado(null);setForm(null);}}><header className="crm-ficha-cabeca"><span className="crm-ficha-legenda">{atual.municipio||atual.lead_cidade||'Município não informado'}</span><h2>{nomeCard(atual)}</h2><p>{[atual.remessa,nucleoCard(atual)].filter(Boolean).join(' · ')}</p></header><EstadoModulo modulo={m}/><div className="crm-ficha-layout"><div><section className="crm-ficha-painel"><span className="crm-ficha-legenda">Ficha</span><h3>Dados do cliente</h3><dl className="crm-ficha-dados"><div className="crm-ficha-nome"><dt>Nome</dt><dd>{nomeCard(atual)}</dd></div></dl>{dadosCard(atual)}</section><section className="crm-ficha-painel"><HistoricoAtendimento key={versaoHistorico} cardId={atual.id} usuario={usuario}/>{atual.origem_dados?.observacoes&&<details><summary>Anotação comercial importada</summary><p className="crm-ficha-relato">{atual.origem_dados.observacoes}</p></details>}</section></div><aside className="crm-ficha-painel"><span className="crm-ficha-legenda">Atualização</span><h3>Registros e status</h3>{!atual.cliente_id&&<button className="btn" onClick={()=>editarComerciais(atual)}>Comerciais responsáveis ({responsaveisLead(atual).length})</button>}{statusCard(atual)}{chatwootCard(atual)}<FollowUpCRM card={atual} usuarios={db.usuarios} atualizar={m.atualizar}/><div className="crm-cliente-botoes"><button className={`btn ${form?.tipo==='atendimento'?'btn-primario':''}`} onClick={()=>setForm({tipo:'atendimento',card:atual})}><MessageSquare size={16}/> Registrar atendimento</button><button className={`btn ${form?.tipo==='tarefa'?'btn-primario':''}`} onClick={()=>setForm({tipo:'tarefa',card:atual})}><ListTodo size={16}/> Registrar tarefa</button></div>{form&&form.tipo!=='followup'&&<RegistroForm key={`${form.tipo}${atual.id}`} {...form} ocupado={m.ocupado} onSalvar={salvar} onCancelar={()=>setForm(null)}/>}
    <details className="crm-ficha-opcoes"><summary>Opções do cliente</summary><div className="crm-cliente-botoes"><button className="btn" onClick={()=>{setSelecionado(null);setForm(null);setTransferencia({card:atual,destino:''});}}>Transferir</button>{atual.cliente_id?<button className="btn" onClick={()=>m.executar(()=>abrirCliente({id:atual.cliente_id,financeiroRef:atual.cliente_id,municipioId:atual.municipio_id}))}>Abrir cadastro</button>:<button className="btn" onClick={()=>{setSelecionado(null);setForm(null);setVinculo(atual);setClienteEscolhido(null);}}>Confirmar cadastro do contato</button>}</div></details></aside></div></FichaCliente>}
    {aba==='institucionais'&&<InstitucionaisCRM usuario={usuario} usuarios={db.usuarios}/>}
    {aba==='dashboard'&&acesso.admin&&<DashboardCRM usuarios={db.usuarios}/>}
    {m.dados&&aba==='funil'&&<div className={`crm-quadro crm-visao-${visao}`}>{ETAPAS_CRM.map(s=><section key={s} className="crm-coluna"><h2>{s} · {cards.filter(c=>c.status===s).length}</h2>{cards.filter(c=>c.status===s).map(card)}</section>)}</div>}
    {m.dados&&aba==='perdidos'&&<div className="crm-grade">{cards.filter(c=>c.status==='Perdido').map(card)}{!cards.some(c=>c.status==='Perdido')&&<p>Nenhum cliente perdido.</p>}</div>}
    {m.dados&&aba==='leads'&&<div className="crm-grade">{cards.filter(c=>!c.cliente_id&&c.status!=='Perdido').map(card)}{!cards.some(c=>!c.cliente_id)&&<p>Nenhum potencial lead.</p>}</div>}
    {m.dados&&aba==='tarefas'&&<section>{!m.dados.tarefas.length&&<p>Nenhuma tarefa aberta.</p>}{m.dados.tarefas.filter(t=>!responsavel||t.responsavel_id===responsavel).sort((a,b)=>a.prazo.localeCompare(b.prazo)).map(t=><article className="crm-card" key={t.id}><h3>{t.titulo}</h3><p>Prazo: {t.prazo.split('-').reverse().join('/')}</p><p>{m.dados.cards.find(c=>c.id===t.card_id)?nomeCard(m.dados.cards.find(c=>c.id===t.card_id)):'Cliente transferido'} · {db.usuarios.find(u=>u.erpRef===t.responsavel_id)?.nome||'Responsável'}</p>{t.checklist.map((item,i)=><label className="crm-tarefa" key={i}><input type="checkbox" checked={!!item.concluido} disabled={m.ocupado} onChange={e=>m.executar(()=>editarCRM('integracao_crm_tarefas',t.id,{checklist:t.checklist.map((x,j)=>j===i?{...x,concluido:e.target.checked}:x)}))}/>{item.texto}</label>)}<button className="btn" disabled={m.ocupado||t.checklist.some(i=>!i.concluido)} onClick={()=>m.executar(()=>editarCRM('integracao_crm_tarefas',t.id,{concluida:true}))}>Concluir tarefa</button></article>)}</section>}
  </div>;
}
