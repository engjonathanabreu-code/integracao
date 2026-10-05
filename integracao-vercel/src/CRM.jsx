import {followupsPrioritarios,podeUsarAgenteComercial} from './agente-comercial-regras.js';
import MetasVendas from './MetasVendas.jsx';
import FollowUpCRM,{ResumoFollowUp,ResumoChatwoot} from './FollowUpCRM.jsx';
import ArquivoCRM from './ArquivoCRM.jsx';
import InstitucionaisCRM from './InstitucionaisCRM.jsx';
import DashboardCRM from './DashboardCRM.jsx';
import HojeCRM from './HojeCRM.jsx';
import FunilCRM,{ListaCadastrosCRM} from './FunilCRM.jsx';
import {EditarComerciaisLead,responsaveisLead} from './ComerciaisLead.jsx';
import {CadastrarLead} from './LeadCRM.jsx';
import NegociacaoCRM from './NegociacaoCRM.jsx';
import EditarCardCRM from './EditarCardCRM.jsx';
import {invalidarIndiceClientes,lerTabela} from './dados-compartilhados.js';
import {salvarNegociacaoCRM} from './crm-api.js';
import {useState,useEffect,useRef,useMemo} from 'react';
import {X,Phone,FileText,MapPin,Layers,MessageSquare,ListTodo,Filter,UserPlus,UserX,BarChart3,Trash2,Archive,Pencil,CalendarCheck} from 'lucide-react';
import {listarCRM,criarCRM,editarCRM,rpcCRM} from './crm-api.js';
import {acessoCRM} from './crm-regras.js';
import {montarCarteira,filtrarItens,opcoesResponsavel,resumoDoDia,decidirMovimento,dadosMovimento,agruparTarefas,normalizarVisao,ETAPAS_ABERTAS,SEM_RESPONSAVEL} from './crm-hoje.js';
import {diaFollowup} from './crm-followup.js';
import './crm.css';
import {BuscaClientes} from './BuscaClientes.jsx';
import AgentesChatwoot from './AgentesChatwoot.jsx';
import {useModulo,EstadoModulo,CampoCRM} from './modulo-ui.jsx';
const nomeCard=c=>c.nome||c.lead_nome||'Contato';
const visoesFunil=[['reduzido','Reduzido'],['semi','Semi'],['detalhada','Detalhada']];
// A chave e os 3 valores gravados não mudam. Sem preferência salva (ou valor inválido) a visão é Reduzida, que mostra o cartão enxuto.
function lerVisaoFunil(chave){try{return normalizarVisao(localStorage.getItem(chave));}catch{return 'reduzido';}}


function RegistroForm({tipo,card,onSalvar,onCancelar,ocupado,conteudoAgente}) {
  const [texto,setTexto]=useState(conteudoAgente||''),[data,setData]=useState(new Date().toLocaleDateString('en-CA')),[itens,setItens]=useState('');
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

function FichaCliente({titulo,fechar,children,compacta=false,ocupado=false,lateral=false}) {
 const ref=useRef(null);
 useEffect(()=>{const d=ref.current;d.showModal();return()=>d.close();},[]);
 // lateral: só a ficha completa. Continua um <dialog> modal (mesmo foco, Esc e backdrop); o CSS o posiciona como gaveta à direita (folha inferior no celular).
 return <dialog ref={ref} className={`crm-ficha-dialogo${compacta?' crm-lead-dialogo':''}${lateral?' crm-ficha-lateral':''}`} aria-label={titulo} onCancel={e=>{e.preventDefault();if(!ocupado)fechar();}}><button className="btn crm-ficha-fechar" aria-label={compacta?"Fechar cadastro":"Fechar ficha"} disabled={ocupado} onClick={fechar}><X size={20}/></button>{lateral?<div className="crm-ficha-corpo">{children}</div>:children}</dialog>;
}
export default function CRM({usuario,db,ir,abrirCliente,pedidoAgente,onRegistroAgente}) {
  const chaveVisao=`integracao-crm-visao-v1:${usuario.erpRef||usuario.id}`;
  const [preferenciaVisao,setPreferenciaVisao]=useState(()=>({chave:chaveVisao,modo:lerVisaoFunil(chaveVisao)}));
  const visao=preferenciaVisao.chave===chaveVisao?preferenciaVisao.modo:lerVisaoFunil(chaveVisao);
  const escolherVisao=modo=>{if(modo==='reduzido'&&visao!=='reduzido'&&document.querySelector('.crm-hf-quadro [data-edicao-pendente="true"]')){setAvisoLead('Há uma negociação em edição. Salve ou descarte antes de trocar a visualização.');return;}setPreferenciaVisao({chave:chaveVisao,modo});try{localStorage.setItem(chaveVisao,modo);}catch{/* A escolha continua disponível nesta sessão. */}};
  const [novoLead,setNovoLead]=useState(pedidoAgente?.tipo==='Lead');
  const [arquivar,setArquivar]=useState(null),[motivoArquivo,setMotivoArquivo]=useState('');
  const [comerciaisLead,setComerciaisLead]=useState(null),[erroComerciais,setErroComerciais]=useState('');
  const editarComerciais=c=>{setSelecionado(null);setForm(null);setErroComerciais('');setComerciaisLead(c);};
  const [avisoLead,setAvisoLead]=useState('');
  const [edicao,setEdicao]=useState(null),[erroEdicao,setErroEdicao]=useState('');
  const abrirEdicao=c=>{setSelecionado(null);setForm(null);setErroEdicao('');setEdicao(c);};
  const [selecionado,setSelecionado]=useState(null),[versaoHistorico,setVersaoHistorico]=useState(0);
  const [vinculo,setVinculo]=useState(null),[clienteEscolhido,setClienteEscolhido]=useState(null);
  const acesso=acessoCRM(usuario),[aba,setAba]=useState('hoje'),[busca,setBusca]=useState(''),[responsavel,setResponsavel]=useState(''),[form,setForm]=useState(null),[historico,setHistorico]=useState(null),[transferencia,setTransferencia]=useState(null);
  const m=useModulo(async()=>{
    if(!acesso.comercial)return {cards:[],tarefas:[]};
    const [cards,tarefas,followups,chatwoot]=await Promise.all([listarCRM('integracao_crm_funil'),listarCRM('integracao_crm_tarefas','&concluida=eq.false'),listarCRM('integracao_crm_followups','&status=eq.pendente'),listarCRM('integracao_crm_chatwoot_resumo')]);
    return {cards,tarefas,followups,chatwoot};
  },[usuario?.id],['crm','clientes','usuarios']);
  const pedidoAplicado=useRef(false);
  useEffect(()=>{if(!pedidoAgente?.id||!m.dados||pedidoAplicado.current||!acesso.comercial)return;pedidoAplicado.current=true;const c=m.dados.cards.find(c=>c.id===pedidoAgente.id);if(!c){setAvisoLead('Card indisponível ou sem permissão. Nenhum dado foi alterado.');return;}if(pedidoAgente.modo==='editar')setEdicao(c);else{setSelecionado(c);setForm(pedidoAgente.modo?{tipo:pedidoAgente.modo,card:c}:null);}},[m.dados,pedidoAgente]);
  const [carteira,setCarteira]=useState('reurb'),[cadastros,setCadastros]=useState({estado:'oculto',linhas:null,clientes:null}),[tentativaCadastros,setTentativaCadastros]=useState(0);
  const [sugestao,setSugestao]=useState(null),[avisoFicha,setAvisoFicha]=useState(''),[confirmacao,setConfirmacao]=useState(null);
  // Cadastros do Integração (somente leitura, só administração; Comercial só enxerga os próprios cartões). Duas leituras: o complemento (integracao_moradores)
  // e o cadastro do financeiro (fin_receb_clientes, sem CPF), porque um cliente pode existir só no financeiro. Falha nunca vira erro da tela.
  useEffect(()=>{if(!acesso.admin||!m.dados)return undefined;let vivo=true;setCadastros(c=>({estado:'carregando',linhas:c.linhas,clientes:c.clientes}));Promise.all([lerTabela('integracao_moradores','registro_id,referencia_id,nome:dados->requerente->>nome,telefone:dados->requerente->>telefone,status_crm:dados->requerente->>statusCRM,situacao:dados->>situacao,municipioId:dados->>municipioId,codigo:dados->>codigo,arquivamento:dados->extras->arquivamento','&colecao=eq.processos'),lerTabela('fin_receb_clientes','id,nome,codigo,municipio_id,ativo')]).then(([linhas,clientes])=>{if(vivo)setCadastros({estado:'ok',linhas,clientes});}).catch(()=>{if(vivo)setCadastros({estado:'erro',linhas:null,clientes:null});});return()=>{vivo=false;};},[acesso.admin,!!m.dados,tentativaCadastros]);
  const carteiraDados=useMemo(()=>montarCarteira({cards:m.dados?.cards||[],followups:m.dados?.followups||[],tarefas:m.dados?.tarefas||[],cadastros:acesso.admin?cadastros.linhas:null,clientes:acesso.admin?cadastros.clientes:null}),[m.dados,cadastros.linhas,cadastros.clientes,acesso.admin]);
  if(!acesso.comercial)return <div className="contem"><h1>CRM</h1><p>Acesso restrito ao Comercial e à administração.</p></div>;
  const comerciais=db.usuarios.filter(u=>u.ativo&&u.tipoERP==='Comercial');
  // Cada cartão (e cada cadastro sem cartão) vira um item; a etapa mostrada vem só de leitura (nada é gravado para classificar).
  const reurb=carteira==='reurb',filtros={busca,responsavel};
  const filtrados=filtrarItens(carteiraDados.cards,filtros),cards=filtrados.map(i=>i.card);
  const abertos=filtrados.filter(i=>ETAPAS_ABERTAS.includes(i.etapa)),cadastrosFiltrados=filtrarItens(carteiraDados.semCartao,filtros);
  const itemPorId=new Map(carteiraDados.cards.map(i=>[i.id,i]));
  const followupsDaCarteira=followupsPrioritarios(cards,m.dados?.followups||[],usuario);
  const itensFollowup=podeUsarAgenteComercial(usuario)?followupsDaCarteira.map(f=>itemPorId.get(f.card.id)).filter(Boolean):null;
  const ativos=[...filtrados.filter(i=>i.etapa==='Cliente ativo'),...cadastrosFiltrados.filter(i=>i.etapa==='Cliente ativo')];
  const leads=filtrados.filter(i=>i.lead&&i.etapa!=='Perdido'),perdidos=filtrados.filter(i=>i.etapa==='Perdido'),cadastrosPerdidos=cadastrosFiltrados.filter(i=>i.etapa==='Perdido');
  const tarefasFiltradas=(m.dados?.tarefas||[]).filter(t=>!responsavel||responsavel===SEM_RESPONSAVEL||t.responsavel_id===responsavel),gruposTarefas=agruparTarefas(tarefasFiltradas,diaFollowup());
  const pendentesHoje=resumoDoDia(filtrarItens(carteiraDados.cards,{responsavel}),Date.now()).pendentes;
  const itemConfirmacao=confirmacao&&carteiraDados.cards.find(i=>i.chave===confirmacao.chave);
  const salvar=async dados=>{if(await m.executar(()=>criarCRM(form.tipo==='tarefa'?'integracao_crm_tarefas':'integracao_crm_atendimentos',dados))){if(pedidoAgente?.id===form.card.id)onRegistroAgente?.('Registrou '+form.tipo,null,dados);setForm(null);setVersaoHistorico(v=>v+1);}};
  const nucleoCard=c=>{if(!c.nucleo_id)return '';const n=db.nucleos.find(n=>n.id===c.nucleo_id||n.externo?.kanbanId===c.nucleo_id);return n?[n.codigo,n.nome!==n.codigo?n.nome:''].filter(Boolean).join(' · '):'Núcleo vinculado';};
  // etapa: etapa já escolhida (arrastar ou Avançar) para a ficha abrir com ela pré-selecionada. Nada é gravado até clicar em Salvar.
  const abrirFicha=(c,tipo=null,etapa=null)=>{setSelecionado(c);setForm(tipo?{tipo,card:c}:null);setHistorico(null);setTransferencia(null);setVinculo(null);setSugestao(etapa?{id:c.id,etapa}:null);setAvisoFicha('');};
  const fecharFicha=()=>{setSelecionado(null);setForm(null);setSugestao(null);setAvisoFicha('');};
  const atual=selecionado&&(m.dados?.cards.find(c=>c.id===selecionado.id)||selecionado);
  const followupCard=c=><ResumoFollowUp pendente={m.dados?.followups.find(f=>f.card_id===c.id)} abrir={()=>abrirFicha(c,'followup')}/>;
  const chatwootCard=c=><ResumoChatwoot resumo={m.dados?.chatwoot.find(r=>r.card_id===c.id)}/>;
  const ativado=(c,status,ok)=>{if(ok&&status==='Cliente ativo'){setSelecionado(null);setForm(null);setAvisoLead(`${nomeCard(c)} passou a Cliente ativo e saiu do funil. O registro fica nos relatórios de clientes ativados.`);}return ok;};
  const statusCard=(c,ficha=false)=>{const sug=ficha&&sugestao?.id===c.id?sugestao.etapa:null;return <NegociacaoCRM key={c.id+(sug||'')} statusSugerido={sug} card={c} ocupado={m.ocupado} onSalvar={async(dados,anterior,concluir)=>m.executar(()=>salvarNegociacaoCRM(c.id,dados,anterior),resultado=>{const salvo=Array.isArray(resultado)?resultado[0]:resultado;concluir?.(salvo);ativado(c,salvo.status,true);})} onConverter={async(fn,status)=>ativado(c,status,await m.executar(fn))}/>;};
  // Único código novo que grava ao mover etapa (arrastar ou Avançar): mesma função, mesmo m.executar e mesma validação da ficha. Sem atualização otimista.
  // Quando falta dado (município e remessa do lead, CPF, forma de negociação) nada é gravado: a ficha abre com a etapa pré-selecionada.
  const moverItem=async(item,destino,{confirmado=false}={})=>{
    if(m.ocupado||!item?.card)return;
    const d=decidirMovimento(item,destino);
    if(d.acao==='nenhuma'){if(d.mensagem)setAvisoLead(d.mensagem);return;}
    if(d.acao==='abrir-ficha'){abrirFicha(item.card,null,d.etapaSugerida);setAvisoFicha(d.mensagem);return;}
    if(d.acao==='confirmar'&&!confirmado){setConfirmacao({chave:item.chave,destino,texto:d.mensagem});return;}
    const r=dadosMovimento(item.card,destino);
    if(!r.ok){abrirFicha(item.card,null,destino);setAvisoFicha(r.erro);return;}
    setConfirmacao(null);
    await m.executar(()=>salvarNegociacaoCRM(item.id,r.dados,item.card),resultado=>{const salvo=Array.isArray(resultado)?resultado[0]:resultado,status=salvo?.status||destino;if(status==='Cliente ativo')ativado(item.card,status,true);else setAvisoLead(`${item.nome} foi para ${status}.`);});
  };
  const abrirCadastro=item=>m.executar(()=>abrirCliente({id:item.registroId,financeiroRef:item.clienteId,municipioId:item.municipioId}));
  const irParaAba=id=>{setAba(id);setHistorico(null);setForm(null);setConfirmacao(null);};
  const trocarCarteira=destino=>{setCarteira(destino);setSelecionado(null);setForm(null);setHistorico(null);setConfirmacao(null);if(destino==='institucional'){setTransferencia(null);setVinculo(null);}};
  const dadosCard=c=><dl className="crm-ficha-dados"><div><dt><FileText size={14}/> CPF</dt><dd>{c.cpf_cnpj||'Não informado'}</dd></div><div><dt><Phone size={14}/> Telefone</dt><dd>{c.telefone||c.lead_telefone||'Não informado'}</dd></div><div><dt><MapPin size={14}/> Município</dt><dd>{c.municipio||c.lead_cidade||'Não informado'}</dd></div><div><dt><Layers size={14}/> Remessa</dt><dd>{c.remessa||'Não informada'}</dd></div>{c.nucleo_id&&<div><dt>Núcleo</dt><dd>{nucleoCard(c)}</dd></div>}</dl>;
  const card=c=><article className="crm-card crm-cliente-card" key={c.id}><div className="crm-card-icones"><button className="crm-card-editar" title="Editar nome, telefone, CPF, cidade e núcleo" aria-label={`Editar ${nomeCard(c)}`} disabled={m.ocupado} onClick={()=>abrirEdicao(c)}><Pencil size={15}/></button>{!c.cliente_id&&<button className="crm-lead-lixeira" title="Excluir lead e guardar no arquivo" aria-label={`Excluir e arquivar ${nomeCard(c)}`} disabled={m.ocupado} onClick={()=>{setMotivoArquivo('');setArquivar(c);}}><Trash2 size={15}/></button>}</div><button className="crm-cliente-abrir" aria-label={`Abrir ficha de ${nomeCard(c)}`} onClick={()=>abrirFicha(c)}><span className="crm-ficha-legenda">{c.municipio||c.lead_cidade||'Município não informado'}</span><h3>{nomeCard(c)}</h3></button>{dadosCard(c)}{statusCard(c)}{followupCard(c)}{chatwootCard(c)}<div className="crm-cliente-botoes"><button className="btn btn-sm" onClick={()=>abrirEdicao(c)}><Pencil size={14}/> Editar</button><button className="btn btn-sm" onClick={()=>abrirFicha(c,'atendimento')}><MessageSquare size={14}/> Registrar atendimento</button><button className="btn btn-sm" onClick={()=>abrirFicha(c,'tarefa')}><ListTodo size={14}/> Registrar tarefa</button><button className="btn btn-sm" onClick={()=>abrirFicha(c)}>Abrir ficha</button>{!c.cliente_id&&<button className="btn btn-sm" onClick={()=>editarComerciais(c)}>Comerciais responsáveis ({responsaveisLead(c).length})</button>}</div></article>;
  const tarefaCard=t=><article className="crm-card" key={t.id}><h3>{t.titulo}</h3><p>Prazo: {t.prazo.split('-').reverse().join('/')}</p><p>{m.dados.cards.find(c=>c.id===t.card_id)?nomeCard(m.dados.cards.find(c=>c.id===t.card_id)):'Cliente transferido'} · {db.usuarios.find(u=>u.erpRef===t.responsavel_id)?.nome||'Responsável'}</p>{t.checklist.map((item,i)=><label className="crm-tarefa" key={i}><input type="checkbox" checked={!!item.concluido} disabled={m.ocupado} onChange={e=>m.executar(()=>editarCRM('integracao_crm_tarefas',t.id,{checklist:t.checklist.map((x,j)=>j===i?{...x,concluido:e.target.checked}:x)}))}/>{item.texto}</label>)}<button className="btn" disabled={m.ocupado||t.checklist.some(i=>!i.concluido)} onClick={()=>m.executar(()=>editarCRM('integracao_crm_tarefas',t.id,{concluida:true}))}>Concluir tarefa</button></article>;
  const botaoAba=([id,nome,Icone])=><button key={id} className={`btn crm-aba${aba===id?' btn-primario':''}`} aria-current={aba===id?'true':undefined} onClick={()=>irParaAba(id)}><Icone size={17} aria-hidden="true"/>{nome}{id==='hoje'&&pendentesHoje>0&&<><span className="crm-abas-selo" aria-hidden="true">{pendentesHoje}</span><span className="crm-sr"> {pendentesHoje} {pendentesHoje===1?'pendência':'pendências'}</span></>}</button>;
  const abasUso=[['hoje','Hoje',CalendarCheck],['funil','Funil comercial',Filter],['leads','Potenciais leads',UserPlus],['tarefas','Tarefas abertas',ListTodo],['perdidos','Perdidos',UserX]];
  const abasGestao=[['metas','Metas',ListTodo],...(acesso.admin?[['dashboard','Dashboard comercial',BarChart3],['arquivo','Arquivo do CRM',Archive]]:[])];
  const comFiltros=reurb&&['hoje','funil','leads','tarefas','perdidos'].includes(aba);
  return <div className="contem largo crm-pagina"><div className="cabeca"><div><h1>CRM</h1><p>Relacionamento, atendimentos e próximos passos.</p></div>{reurb&&aba!=='metas'&&<button className="btn btn-primario" onClick={()=>setNovoLead(true)}><UserPlus size={17}/>Cadastrar lead</button>}</div>
    <div className="crm-carteiras" role="group" aria-label="Tipo de cliente">{[['reurb','CRM Reurb'],['institucional','CRM Institucional']].map(([id,nome])=><button key={id} className={`btn crm-aba${carteira===id?' btn-primario':''}`} aria-pressed={carteira===id} onClick={()=>trocarCarteira(id)}>{nome}</button>)}</div>
    {reurb&&<div className="crm-abas" role="group" aria-label="Seções do CRM">{abasUso.map(botaoAba)}<span className="crm-abas-sep" aria-hidden="true"/>{abasGestao.map(botaoAba)}</div>}
    {comFiltros&&<div className="crm-acoes"><input className="inp" aria-label="Buscar no CRM" placeholder="Nome, CPF, telefone ou município" value={busca} onChange={e=>setBusca(e.target.value)}/>{acesso.admin&&<select className="inp" aria-label="Filtrar comercial" value={responsavel} onChange={e=>setResponsavel(e.target.value)}><option value="">Todos os comerciais</option>{comerciais.map(u=><option key={u.id} value={u.erpRef}>{u.nome}</option>)}{opcoesResponsavel(carteiraDados.cards,db.usuarios).map(o=><option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select>}</div>}
    {reurb&&aba==='funil'&&<div className="crm-visoes" role="group" aria-label="Visualização do funil"><span>Visualização</span>{visoesFunil.map(([id,nome])=><button key={id} className={`btn btn-sm${visao===id?' btn-primario':''}`} aria-pressed={visao===id} onClick={()=>escolherVisao(id)}>{nome}</button>)}</div>}
    {reurb&&aba==='funil'&&<p className="ajuda">Clientes marcados como Cliente ativo saem das colunas do funil e ficam na lista Clientes ativos, abaixo delas. A ativação fica registrada{acesso.admin?' no relatório Clientes ativados do Dashboard comercial':' para os relatórios de desempenho'}.</p>}
    <EstadoModulo modulo={m}/>
    {avisoLead&&<p role="status" className="ajuda">{avisoLead}</p>}
    {comerciaisLead&&<FichaCliente titulo="Comerciais do lead" compacta ocupado={m.ocupado} fechar={()=>setComerciaisLead(null)}><EditarComerciaisLead card={comerciaisLead} comerciais={comerciais} ocupado={m.ocupado} erro={erroComerciais} cancelar={()=>setComerciaisLead(null)} salvar={async(novos,anteriores)=>{setErroComerciais('');if(await m.executar(async()=>{try{await rpcCRM('integracao_crm_definir_comerciais',{p_card:comerciaisLead.id,p_responsaveis:novos,p_anteriores:anteriores});}catch(e){setErroComerciais(e.message);m.atualizar();throw e;}})){setComerciaisLead(null);setAvisoLead('Responsáveis do lead atualizados.');}}}/></FichaCliente>}
    {edicao&&<FichaCliente titulo={`Editar ${nomeCard(edicao)}`} compacta ocupado={m.ocupado} fechar={()=>setEdicao(null)}><EditarCardCRM ajustesAgente={pedidoAgente?.id===edicao?.id?pedidoAgente.ajustes:null} card={edicao} nucleos={db.nucleos||[]} ocupado={m.ocupado} erro={erroEdicao} cancelar={()=>setEdicao(null)} salvar={async dados=>{setErroEdicao('');if(await m.executar(async()=>{try{await rpcCRM('integracao_crm_editar_card',dados);if(edicao.cliente_id)invalidarIndiceClientes();}catch(e){setErroEdicao(e.message);throw e;}})){if(pedidoAgente?.id===edicao.id)onRegistroAgente?.('Atualizou dados do CRM',edicao,dados);setEdicao(null);setAvisoLead(`Dados de ${dados.p_nome} atualizados.`);}}}/></FichaCliente>}
    {arquivar&&<FichaCliente titulo="Excluir lead e arquivar" compacta ocupado={m.ocupado} fechar={()=>setArquivar(null)}><form className="crm-form" onSubmit={async e=>{e.preventDefault();if(await m.executar(()=>rpcCRM('integracao_crm_arquivar_lead',{p_card:arquivar.id,p_arquivar:true,p_motivo:motivoArquivo.trim()}))){setSelecionado(null);setArquivar(null);setAvisoLead('Lead retirado da lista e preservado no Arquivo do CRM.');}}}><h2>Excluir lead da lista</h2><p><strong>{nomeCard(arquivar)}</strong></p><p>Os dados e o histórico ficarão no Arquivo do CRM, onde a diretoria poderá consultar, exportar e restaurar o lead. O FollowUp pendente será encerrado.</p>{m.erro&&<p role="alert" className="crm-erro">{m.erro}</p>}<CampoCRM nome="Motivo do arquivamento"><textarea className="inp" required minLength={3} maxLength={2000} value={motivoArquivo} onChange={e=>setMotivoArquivo(e.target.value)}/></CampoCRM><div className="crm-acoes"><button className="btn btn-primario" disabled={m.ocupado||motivoArquivo.trim().length<3}>Excluir e guardar no arquivo</button><button className="btn" type="button" disabled={m.ocupado} onClick={()=>setArquivar(null)}>Cancelar</button></div></form></FichaCliente>}
    {novoLead&&<FichaCliente titulo="Cadastrar lead" compacta ocupado={m.ocupado} fechar={()=>setNovoLead(false)}><CadastrarLead inicial={pedidoAgente?.tipo==='Lead'?pedidoAgente.preenchimento:null} erro={m.erro} comerciais={comerciais} usuario={usuario} ocupado={m.ocupado} cancelar={()=>setNovoLead(false)} salvar={async dados=>{if(await m.executar(()=>rpcCRM('integracao_crm_cadastrar_lead_compartilhado',dados))){if(pedidoAgente?.tipo==='Lead')onRegistroAgente?.('Criou lead',null,dados);setAvisoLead(`Lead cadastrado para ${comerciais.filter(u=>dados.p_responsaveis.includes(u.erpRef)).map(u=>u.nome).join(', ')}. Ele aparecerá no funil dos responsáveis selecionados.`);setNovoLead(false);setAba('funil');}}}/></FichaCliente>}
    {acesso.admin&&(!reurb||aba!=='metas')&&<details className="crm-painel"><summary>Configurar agentes do Chatwoot</summary><AgentesChatwoot usuario={usuario} db={db}/></details>}
    {vinculo&&<section className="crm-card"><h2>Confirmar identidade de {nomeCard(vinculo)}</h2><p>Confira o titular com o contato antes de vincular o histórico. O cadastro existente será preservado.</p><BuscaClientes db={db} abrirCliente={async p=>setClienteEscolhido(p)}/>{clienteEscolhido&&<><p>Selecionado: {clienteEscolhido.codigo} · {clienteEscolhido.requerente?.nome}</p><button className="btn btn-primario" disabled={m.ocupado} onClick={async()=>{if(await m.executar(()=>rpcCRM('integracao_crm_vincular',{card:vinculo.id,cliente:clienteEscolhido.financeiroRef||clienteEscolhido.id})))setVinculo(null);}}>Identidade conferida — vincular</button></>}<button className="btn" onClick={()=>setVinculo(null)}>Cancelar</button></section>}
    {form&&form.tipo!=='followup'&&!atual&&<RegistroForm conteudoAgente={pedidoAgente?.id===form?.card?.id&&pedidoAgente?.modo===form?.tipo?pedidoAgente.conteudo:null} key={`${form.tipo}${form.card.id}`} {...form} ocupado={m.ocupado} onSalvar={salvar} onCancelar={()=>setForm(null)}/>}
    {transferencia&&<form className="crm-form" onSubmit={async e=>{e.preventDefault();if(await m.executar(()=>rpcCRM('integracao_crm_transferir',{card:transferencia.card.id,destino:transferencia.destino})))setTransferencia(null);}}><h3>Transferir {nomeCard(transferencia.card)}</h3><p>Esta transferência substitui todos os responsáveis pelo comercial escolhido. O histórico acompanha o cliente; tarefas existentes continuam com seus responsáveis.</p><select className="inp" required aria-label="Novo responsável" value={transferencia.destino} onChange={e=>setTransferencia(t=>({...t,destino:e.target.value}))}><option value="">Escolha um comercial</option>{comerciais.map(u=><option key={u.id} value={u.erpRef}>{u.nome}</option>)}</select><div className="crm-acoes"><button className="btn btn-primario" disabled={m.ocupado}>Confirmar transferência</button><button className="btn" type="button" onClick={()=>setTransferencia(null)}>Cancelar</button></div></form>}
    {historico&&<><button className="btn" onClick={()=>setHistorico(null)}>Fechar histórico</button><HistoricoAtendimento cardId={historico.id} usuario={usuario}/></>}
    {atual&&<FichaCliente lateral titulo={`Ficha de ${nomeCard(atual)}`} fechar={fecharFicha}><header className="crm-ficha-cabeca"><span className="crm-ficha-legenda">{atual.municipio||atual.lead_cidade||'Município não informado'}</span><h2>{nomeCard(atual)}</h2><p>{[atual.remessa,nucleoCard(atual)].filter(Boolean).join(' · ')}</p>{itemPorId.get(atual.id)&&<p className="crm-ficha-etapa">Etapa: {itemPorId.get(atual.id).etapa}{itemPorId.get(atual.id).pendencias.length>0&&<><br/>Falta completar: {itemPorId.get(atual.id).pendencias.join(' · ')}</>}</p>}{avisoFicha&&<p role="status" className="crm-ficha-etapa">{avisoFicha}</p>}</header><EstadoModulo modulo={m}/><div className="crm-ficha-layout"><aside className="crm-ficha-painel"><span className="crm-ficha-legenda">Atualização</span><h3>Registros e status</h3>{!atual.cliente_id&&<button className="btn" onClick={()=>editarComerciais(atual)}>Comerciais responsáveis ({responsaveisLead(atual).length})</button>}{statusCard(atual,true)}{chatwootCard(atual)}<FollowUpCRM onRegistroAgente={pedidoAgente?.id===atual.id?onRegistroAgente:null} card={atual} usuarios={db.usuarios} atualizar={m.atualizar}/><div className="crm-cliente-botoes"><button className={`btn ${form?.tipo==='atendimento'?'btn-primario':''}`} onClick={()=>setForm({tipo:'atendimento',card:atual})}><MessageSquare size={16}/> Registrar atendimento</button><button className={`btn ${form?.tipo==='tarefa'?'btn-primario':''}`} onClick={()=>setForm({tipo:'tarefa',card:atual})}><ListTodo size={16}/> Registrar tarefa</button></div>{form&&form.tipo!=='followup'&&<RegistroForm conteudoAgente={pedidoAgente?.id===form?.card?.id&&pedidoAgente?.modo===form?.tipo?pedidoAgente.conteudo:null} key={`${form.tipo}${atual.id}`} {...form} ocupado={m.ocupado} onSalvar={salvar} onCancelar={()=>setForm(null)}/>}
    <details className="crm-ficha-opcoes"><summary>Opções do cliente</summary><div className="crm-cliente-botoes"><button className="btn" onClick={()=>{setSelecionado(null);setForm(null);setTransferencia({card:atual,destino:''});}}>Transferir</button>{atual.cliente_id?<button className="btn" onClick={()=>m.executar(()=>abrirCliente({id:atual.cliente_id,financeiroRef:atual.cliente_id,municipioId:atual.municipio_id}))}>Abrir cadastro</button>:<button className="btn" onClick={()=>{setSelecionado(null);setForm(null);setVinculo(atual);setClienteEscolhido(null);}}>Confirmar cadastro do contato</button>}</div></details></aside><div><section className="crm-ficha-painel"><span className="crm-ficha-legenda">Ficha</span><h3>Dados do cliente</h3><button className="btn btn-sm" onClick={()=>abrirEdicao(atual)}><Pencil size={14}/> Editar dados</button><dl className="crm-ficha-dados"><div className="crm-ficha-nome"><dt>Nome</dt><dd>{nomeCard(atual)}</dd></div></dl>{dadosCard(atual)}</section><section className="crm-ficha-painel"><HistoricoAtendimento key={versaoHistorico} cardId={atual.id} usuario={usuario}/>{atual.origem_dados?.observacoes&&<details><summary>Anotação comercial importada</summary><p className="crm-ficha-relato">{atual.origem_dados.observacoes}</p></details>}</section></div></div></FichaCliente>}
    {reurb&&aba==='arquivo'&&acesso.admin&&<ArquivoCRM usuarios={db.usuarios} atualizar={m.atualizar} historico={id=><HistoricoAtendimento cardId={id} usuario={usuario}/>}/>}
    {carteira==='institucional'&&<div className="crm-carteira-inst"><InstitucionaisCRM usuario={usuario} usuarios={db.usuarios}/></div>}
    {reurb&&aba==='metas'&&<MetasVendas usuario={usuario} db={db}/>}
    {reurb&&aba==='dashboard'&&acesso.admin&&<DashboardCRM usuarios={db.usuarios} itens={carteiraDados.cards} onVerCarteira={id=>{setResponsavel(id);irParaAba('hoje');}}/>}
    {reurb&&m.dados&&aba==='hoje'&&<HojeCRM itens={abertos} tarefasResumo={{atrasadas:gruposTarefas.atrasadas.length,hoje:gruposTarefas.hoje.length}} ocupado={m.ocupado} onAbrirFicha={(i,tipo)=>abrirFicha(i.card,tipo||null)} onIrParaTarefas={()=>irParaAba('tarefas')} onAviso={setAvisoLead}/>}
    {reurb&&m.dados&&aba==='funil'&&<FunilCRM itens={abertos} followups={itensFollowup} semCartao={{estado:cadastros.estado,itens:cadastrosFiltrados.filter(i=>ETAPAS_ABERTAS.includes(i.etapa))}} ativos={ativos} inativos={filtrarItens(carteiraDados.inativos,filtros)} visao={visao} ocupado={m.ocupado} confirmacao={itemConfirmacao?confirmacao:null} renderCompleto={i=>card(i.card)} onAbrirFicha={(i,tipo)=>abrirFicha(i.card,tipo||null)} onEditar={i=>abrirEdicao(i.card)} onExcluirLead={i=>{setMotivoArquivo('');setArquivar(i.card);}} onMover={moverItem} onConfirmar={()=>moverItem(itemConfirmacao,confirmacao.destino,{confirmado:true})} onCancelarConfirmacao={()=>setConfirmacao(null)} onAbrirCadastro={abrirCadastro} onAtualizarCadastros={()=>setTentativaCadastros(t=>t+1)}/>}
    {reurb&&m.dados&&aba==='perdidos'&&<><div className="crm-grade">{perdidos.map(i=>card(i.card))}{!perdidos.length&&!cadastrosPerdidos.length&&<p>Nenhum cliente perdido.</p>}</div>{cadastrosPerdidos.length>0&&<ListaCadastrosCRM titulo="Cadastros sem cartão marcados como perdidos" itens={cadastrosPerdidos} onAbrirCadastro={abrirCadastro} onAbrirFicha={i=>abrirFicha(i.card)}/>}</>}
    {reurb&&m.dados&&aba==='leads'&&<div className="crm-grade">{leads.map(i=>card(i.card))}{!leads.length&&<p>Nenhum potencial lead.</p>}</div>}
    {reurb&&m.dados&&aba==='tarefas'&&<section className="crm-tarefas">{!tarefasFiltradas.length&&<p>Nenhuma tarefa aberta.</p>}{[['atrasadas','Atrasadas'],['hoje','Para hoje'],['proximas','Próximas']].filter(([id])=>gruposTarefas[id].length).map(([id,titulo])=><section key={id} className="crm-tarefas-grupo"><h2 className="crm-tarefas-titulo">{titulo} · {gruposTarefas[id].length}</h2>{gruposTarefas[id].map(tarefaCard)}</section>)}</section>}
  </div>;
}
