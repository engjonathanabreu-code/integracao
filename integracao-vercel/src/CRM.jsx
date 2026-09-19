import {useState} from 'react';
import {listarCRM,criarCRM,editarCRM,rpcCRM} from './crm-api.js';
import {ETAPAS_CRM,acessoCRM,normalizarCRM} from './crm-regras.js';
import './crm.css';
import {BuscaClientes} from './BuscaClientes.jsx';
import AgentesChatwoot from './AgentesChatwoot.jsx';
import {useModulo,EstadoModulo,CampoCRM} from './modulo-ui.jsx';
const nomeCard=c=>c.nome||c.lead_nome||'Contato';

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
  },[cardId,clienteId,usuario?.id]);
  if(!acesso.comercial)return <p>O histórico de atendimento está disponível ao comercial responsável e à administração.</p>;
  return <section className="crm-painel"><h2>Atendimentos e conversas</h2><EstadoModulo modulo={m}/>{m.dados&&<>
    {!m.dados.atendimentos.length&&!m.dados.mensagens.length&&<p>Nenhum atendimento disponível para este cliente.</p>}
    {[...m.dados.atendimentos.map(a=>({...a,conteudo:a.relato,autor:'Atendimento manual'})),...m.dados.mensagens].sort((a,b)=>String(b.data).localeCompare(String(a.data))).map(x=><article className="crm-mensagem" key={x.id}><strong>{x.autor||'Equipe'}{x.privada?' · Nota interna':''}</strong><div className="ajuda">{new Date(x.data).toLocaleString('pt-BR')}</div><p>{x.conteudo}</p>{(x.anexos||[]).map((a,i)=><span key={i}>Anexo: {a.nome||a.file_type||'arquivo'}{a.url&&/^https:\/\//.test(a.url)?<> · <a href={a.url} target="_blank" rel="noreferrer">Abrir</a></>:null}</span>)}</article>)}
  </>}</section>;
}

export default function CRM({usuario,db,ir,abrirCliente}) {
  const [vinculo,setVinculo]=useState(null),[clienteEscolhido,setClienteEscolhido]=useState(null);
  const acesso=acessoCRM(usuario),[aba,setAba]=useState('funil'),[busca,setBusca]=useState(''),[responsavel,setResponsavel]=useState(''),[form,setForm]=useState(null),[historico,setHistorico]=useState(null),[transferencia,setTransferencia]=useState(null);
  const m=useModulo(async()=>{
    if(!acesso.comercial)return {cards:[],tarefas:[]};
    const [cards,tarefas]=await Promise.all([listarCRM('integracao_crm_funil'),listarCRM('integracao_crm_tarefas','&concluida=eq.false')]);return {cards,tarefas};
  },[usuario?.id]);
  if(!acesso.comercial)return <div className="contem"><h1>CRM</h1><p>Acesso restrito ao Comercial e à administração.</p></div>;
  const comerciais=db.usuarios.filter(u=>u.ativo&&u.tipoERP==='Comercial');
  const cards=(m.dados?.cards||[]).filter(c=>c.origem!=='vinculado'&&(!responsavel||c.responsavel_id===responsavel)&&normalizarCRM([nomeCard(c),c.cpf_cnpj,c.telefone,c.lead_telefone,c.municipio,c.lead_cidade].join(' ')).includes(normalizarCRM(busca)));
  const salvar=async dados=>{if(await m.executar(()=>criarCRM(form.tipo==='tarefa'?'integracao_crm_tarefas':'integracao_crm_atendimentos',dados)))setForm(null);};
  const card=c=><article className="crm-card" key={c.id}><h3>{nomeCard(c)}</h3>{c.codigo&&<p className="ajuda">{c.codigo}</p>}<p>{c.cpf_cnpj||'Documento não informado'}</p><p>{c.telefone||c.lead_telefone||'Telefone não informado'}</p><p>{c.municipio||c.lead_cidade||'Município a confirmar'}{c.remessa?` · ${c.remessa}`:''}</p>
    <label>Status<select className="inp" aria-label={`Status de ${nomeCard(c)}`} value={c.status} disabled={m.ocupado} onChange={e=>m.executar(()=>editarCRM('integracao_crm_cards',c.id,{status:e.target.value}))}>{[...ETAPAS_CRM,'Perdido'].map(s=><option key={s}>{s}</option>)}</select></label>
    {c.origem_dados?.status&&<p className="ajuda">Etapa no CRM de origem: {c.origem_dados.status}</p>}{c.origem_dados?.observacoes&&<details><summary>Anotação comercial importada</summary><p>{c.origem_dados.observacoes}</p></details>}
    <div className="crm-acoes"><button className="btn btn-sm" onClick={()=>setForm({tipo:'atendimento',card:c})}>Registrar atendimento</button><button className="btn btn-sm" onClick={()=>setForm({tipo:'tarefa',card:c})}>Registrar tarefa</button><button className="btn btn-sm" onClick={()=>setHistorico(c)}>Histórico</button><button className="btn btn-sm" onClick={()=>setTransferencia({card:c,destino:''})}>Transferir</button>{!c.cliente_id&&<button className="btn btn-sm" onClick={()=>{setVinculo(c);setClienteEscolhido(null);}}>Confirmar cadastro do contato</button>}{c.cliente_id&&<button className="btn btn-sm" onClick={()=>m.executar(()=>abrirCliente({id:c.cliente_id,financeiroRef:c.cliente_id,municipioId:c.municipio_id}))}>Abrir cadastro</button>}</div></article>;
  return <div className="contem largo"><div className="cabeca"><div><h1>CRM</h1><p>Relacionamento, atendimentos e próximos passos.</p></div><button className="btn btn-primario" onClick={()=>ir({pag:'municipios'})}>Cadastrar cliente no município</button></div>
    <div className="crm-nav">{[['funil','Funil comercial'],['leads','Potenciais leads'],['tarefas','Tarefas abertas'],['perdidos','Perdidos']].map(([id,nome])=><button key={id} className={`btn ${aba===id?'btn-primario':''}`} onClick={()=>{setAba(id);setHistorico(null);setForm(null);}}>{nome}</button>)}</div>
    <div className="crm-acoes"><input className="inp" aria-label="Buscar no CRM" placeholder="Nome, CPF, telefone ou município" value={busca} onChange={e=>setBusca(e.target.value)}/>{acesso.admin&&<select className="inp" aria-label="Filtrar comercial" value={responsavel} onChange={e=>setResponsavel(e.target.value)}><option value="">Todos os comerciais</option>{comerciais.map(u=><option key={u.id} value={u.erpRef}>{u.nome}</option>)}</select>}</div>
    <EstadoModulo modulo={m}/>
    {acesso.admin&&<details className="crm-painel"><summary>Configurar agentes do Chatwoot</summary><AgentesChatwoot usuario={usuario} db={db}/></details>}
    {vinculo&&<section className="crm-card"><h2>Confirmar identidade de {nomeCard(vinculo)}</h2><p>Confira o titular com o contato antes de vincular o histórico. O cadastro existente será preservado.</p><BuscaClientes db={db} abrirCliente={async p=>setClienteEscolhido(p)}/>{clienteEscolhido&&<><p>Selecionado: {clienteEscolhido.codigo} · {clienteEscolhido.requerente?.nome}</p><button className="btn btn-primario" disabled={m.ocupado} onClick={async()=>{if(await m.executar(()=>rpcCRM('integracao_crm_vincular',{card:vinculo.id,cliente:clienteEscolhido.financeiroRef||clienteEscolhido.id})))setVinculo(null);}}>Identidade conferida — vincular</button></>}<button className="btn" onClick={()=>setVinculo(null)}>Cancelar</button></section>}
    {form&&<RegistroForm key={`${form.tipo}${form.card.id}`} {...form} ocupado={m.ocupado} onSalvar={salvar} onCancelar={()=>setForm(null)}/>}
    {transferencia&&<form className="crm-form" onSubmit={async e=>{e.preventDefault();if(await m.executar(()=>rpcCRM('integracao_crm_transferir',{card:transferencia.card.id,destino:transferencia.destino})))setTransferencia(null);}}><h3>Transferir {nomeCard(transferencia.card)}</h3><p>O histórico acompanha o cliente. Tarefas existentes continuam com seus responsáveis.</p><select className="inp" required aria-label="Novo responsável" value={transferencia.destino} onChange={e=>setTransferencia(t=>({...t,destino:e.target.value}))}><option value="">Escolha um comercial</option>{comerciais.map(u=><option key={u.id} value={u.erpRef}>{u.nome}</option>)}</select><div className="crm-acoes"><button className="btn btn-primario" disabled={m.ocupado}>Confirmar transferência</button><button className="btn" type="button" onClick={()=>setTransferencia(null)}>Cancelar</button></div></form>}
    {historico&&<><button className="btn" onClick={()=>setHistorico(null)}>Fechar histórico</button><HistoricoAtendimento cardId={historico.id} usuario={usuario}/></>}
    {m.dados&&aba==='funil'&&<div className="crm-quadro">{ETAPAS_CRM.map(s=><section key={s} className="crm-coluna"><h2>{s} · {cards.filter(c=>c.cliente_id&&c.status===s).length}</h2>{cards.filter(c=>c.cliente_id&&c.status===s).map(card)}</section>)}</div>}
    {m.dados&&aba==='perdidos'&&<div className="crm-grade">{cards.filter(c=>c.status==='Perdido').map(card)}{!cards.some(c=>c.status==='Perdido')&&<p>Nenhum cliente perdido.</p>}</div>}
    {m.dados&&aba==='leads'&&<div className="crm-grade">{cards.filter(c=>!c.cliente_id&&c.status!=='Perdido').map(card)}{!cards.some(c=>!c.cliente_id)&&<p>Nenhum potencial lead.</p>}</div>}
    {m.dados&&aba==='tarefas'&&<section>{!m.dados.tarefas.length&&<p>Nenhuma tarefa aberta.</p>}{m.dados.tarefas.filter(t=>!responsavel||t.responsavel_id===responsavel).sort((a,b)=>a.prazo.localeCompare(b.prazo)).map(t=><article className="crm-card" key={t.id}><h3>{t.titulo}</h3><p>Prazo: {t.prazo.split('-').reverse().join('/')}</p><p>{m.dados.cards.find(c=>c.id===t.card_id)?nomeCard(m.dados.cards.find(c=>c.id===t.card_id)):'Cliente transferido'} · {db.usuarios.find(u=>u.erpRef===t.responsavel_id)?.nome||'Responsável'}</p>{t.checklist.map((item,i)=><label className="crm-tarefa" key={i}><input type="checkbox" checked={!!item.concluido} disabled={m.ocupado} onChange={e=>m.executar(()=>editarCRM('integracao_crm_tarefas',t.id,{checklist:t.checklist.map((x,j)=>j===i?{...x,concluido:e.target.checked}:x)}))}/>{item.texto}</label>)}<button className="btn" disabled={m.ocupado||t.checklist.some(i=>!i.concluido)} onClick={()=>m.executar(()=>editarCRM('integracao_crm_tarefas',t.id,{concluida:true}))}>Concluir tarefa</button></article>)}</section>}
  </div>;
}
