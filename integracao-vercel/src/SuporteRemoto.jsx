import {useEffect,useRef,useState} from 'react';
import {capturarSessao} from './dados-compartilhados.js';
import {suporteRemotoApi} from './suporte-remoto-api.js';
import {restricaoPermitida} from './diagnostico-validacao.js';
import './suporte-remoto.css';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idSeguro=v=>typeof v==='string'&&UUID.test(v)?v:null;
const tipos={diagnostico:'Solicitar diagnóstico',consultar_recibo:'Consultar recibo',retomar_automaticas:'Retomar tentativas automáticas',reler_confirmacao:'Repetir leitura de confirmação',solicitar_atualizacao:'Solicitar atualização do aplicativo',revisar_bloqueios:'Ver bloqueios para revisão'};
const estados={criada:'Criada',recebida:'Recebida',iniciada:'Iniciada',concluida:'Concluída',negada:'Negada',vencida:'Vencida',cancelada:'Cancelada',resultado_incerto:'Resultado incerto'};
const estadosFila=new Set(['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura','bloqueado_conflito','bloqueado_validacao','persistencia_falhou','legado_revisao','confirmado','substituido','dispensado']);
const codigos=new Set(['DIAGNOSTICO','RECIBO_LOCAL','RECIBO_ENCONTRADO','SEM_RECIBO','LEITURA_CONFIRMADA','LEITURA_DIVERGENTE','REVISAO_NECESSARIA','EM_ANDAMENTO','ATUALIZACAO_SOLICITADA','SESSAO_ALTERADA','SEM_ALTERACAO','PERSISTENCIA_INDISPONIVEL','ARQUIVO_LOCAL_AUSENTE','RESULTADO_INCERTO','PEDIDO_AUSENTE','SEM_ERRO','OUTRO','SESSAO_EXPIRADA','SESSAO_AUSENTE','TRANSPORTE','RESPONSAVEL_INDISPONIVEL','IDENTIDADE_OUTRA_META','PERSISTENCIA_ABORTADA','FILA_BLOQUEADA']);
const modulos=new Set(['processos','municipios','remessas','nucleos','metas','planos','ordensServico','eventos','usuarios','arquivos','auditoria','config','crmCards','crmAtendimentos','crmTarefas','conversas','mensagens','pontoBatidas','pontoSolicitacoes','marketingGrupos','outros']);
const esperas=new Set(['nao_verificado','encerrado','revisao','retomada_manual','intervalo_de_tentativa','reserva_ativa','pedido_anterior','dependencia','pronto_para_verificacao']);
const codigoSeguro=v=>typeof v==='string'&&(codigos.has(v)||/^[0-9A-Z]{5}$/.test(v))?v:'OUTRO';
const hora=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('pt-BR'):'Sem contato';
const eventoSeguro=v=>Object.hasOwn(estados,v)?estados[v]:['solicitada','cancelamento_solicitado','autorizada','recebimento','expiracao','revogacao','conclusao','reentrega'].includes(v)?v.replaceAll('_',' '):'Evento técnico registrado';
const fechado={operador:false,habilitado:false,carregando:false,conta:null,sinal:null};
const capturarSemFalhar=capturar=>{try{return capturar();}catch{return null;}};

// Capability is server-derived and tied to the current authenticated session.
// A new account/session immediately hides the old answer, before effects run.
export function useAcessoSuporte(usuario,{api=suporteRemotoApi,capturar=capturarSessao}={}){
 const conta=usuario?.ativo!==false?idSeguro(usuario?.erpRef):null;
 const contexto=capturarSemFalhar(capturar),sinal=contexto?.signal;
 const [resposta,setResposta]=useState(fechado),[online,setOnline]=useState(()=>globalThis.navigator?.onLine!==false);
 useEffect(()=>{const atualizar=()=>setOnline(globalThis.navigator?.onLine!==false);globalThis.addEventListener?.('online',atualizar);globalThis.addEventListener?.('offline',atualizar);return()=>{globalThis.removeEventListener?.('online',atualizar);globalThis.removeEventListener?.('offline',atualizar);};},[]);
 useEffect(()=>{
  let ativo=true;
  setResposta(fechado);
  if(!conta||!online||contexto?.owner!==conta||sinal?.aborted)return()=>{ativo=false;};
  let consultando=false;
  const consultar=()=>{if(consultando||!ativo)return;consultando=true;Promise.resolve().then(()=>api.capacidade()).then(r=>{
   contexto.conferir();
   if(ativo&&!sinal?.aborted)setResposta({conta,sinal,api,operador:r?.operador===true,habilitado:r?.habilitado===true,carregando:false});
  }).catch(()=>{if(ativo)setResposta({...fechado,conta,sinal,api});}).finally(()=>{consultando=false;});};
  consultar();const timer=setInterval(consultar,60000);globalThis.addEventListener?.('focus',consultar);
  return()=>{ativo=false;clearInterval(timer);globalThis.removeEventListener?.('focus',consultar);};
 },[conta,api,sinal,online]);
 const valida=!!conta&&online&&contexto?.owner===conta&&!sinal?.aborted&&resposta.conta===conta&&resposta.sinal===sinal&&resposta.api===api;
 return valida?{...resposta,negar:()=>setResposta({...fechado,conta,sinal,api})}:{...fechado,conta,sinal,carregando:!!conta&&online&&contexto?.owner===conta&&!sinal?.aborted};
}

export function estadoDispositivo(d,agora=Date.now()){
 const instante=Date.parse(d?.ultimo_contato),intervalo=agora-instante;
 return Number.isFinite(instante)&&intervalo>=-10000&&intervalo<=120000?(d.protocolo===1?'disponivel':'incompativel'):Number.isFinite(instante)?'antigo':'desconhecido';
}
const chaveMemoria=conta=>'integracao-suporte-solicitacoes-v1-'+conta;
function pedidoValido(v){return v&&idSeguro(v.id)&&idSeguro(v.atendimento)&&idSeguro(v.usuario_id)&&idSeguro(v.instalacao_id)&&Object.hasOwn(tipos,v.tipo)&&(v.pedido===null||idSeguro(v.pedido));}
function rascunhosSalvos(conta){
 try{const rows=JSON.parse(sessionStorage.getItem(chaveMemoria(conta))||'[]');return Array.isArray(rows)?Object.fromEntries(rows.filter(pedidoValido).slice(0,100).map(v=>[v.instalacao_id,{id:v.id,atendimento:v.atendimento,usuario_id:v.usuario_id,instalacao_id:v.instalacao_id,tipo:v.tipo,pedido:v.pedido}])):{};}catch{return {};}
}
function gravarRascunhos(conta,rascunhos){sessionStorage.setItem(chaveMemoria(conta),JSON.stringify(Object.values(rascunhos)));}
function Resultado({resultado,reciboNoServidor}){
 if(!resultado||typeof resultado!=='object')return null;
 return <div className="suporte-resultado"><p><strong>{codigoSeguro(resultado.codigo)}</strong> · Relato do aparelho</p>
  <p>{reciboNoServidor===true?'Recibo no servidor confirmado para este pedido.':reciboNoServidor===false?'Recibo não confirmado nesta resposta.':'Recibo no servidor não verificado nesta resposta.'} A leitura é relatada pelo aparelho; outros aparelhos não foram verificados.</p>
  {Array.isArray(resultado.itens)&&resultado.itens.slice(0,100).map((i,n)=><p key={idSeguro(i.id)||n}><code>{idSeguro(i.pedido)||idSeguro(i.id)||'Sem identificador válido'}</code> · {estadosFila.has(i.estado)?i.estado:'Estado não reconhecido'} · {codigoSeguro(i.codigo)}{i.temRecibo===true?' · recibo informado pelo aparelho':''}{restricaoPermitida(i.restricao)?<> · restrição: <code>{i.restricao}</code></>:null}{esperas.has(i.espera)?<> · espera: {i.espera}</>:null}{Array.isArray(i.dependencias)&&i.dependencias.some(idSeguro)?<> · dependências: {i.dependencias.filter(idSeguro).slice(0,100).join(', ')}</>:null}</p>)}
 </div>;
}

export default function SuporteRemoto({usuario,acesso,api=suporteRemotoApi}){
 const conta=idSeguro(usuario?.erpRef),sinal=acesso?.sinal;
 const permitido=!!conta&&acesso?.operador===true&&acesso.conta===conta&&!sinal?.aborted;
 const atual=useRef();atual.current={conta,sinal,permitido,api};
 const [painel,setPainel]=useState(null),[erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false),[agora,setAgora]=useState(Date.now());
 const [formularios,setFormularios]=useState({}),[confirmacao,setConfirmacao]=useState(null),[pendentes,setPendentes]=useState({conta:null,itens:{}});
 const emCurso=useRef(false),sequencia=useRef(0);
 const valido=contexto=>atual.current.permitido&&atual.current.conta===contexto.conta&&atual.current.sinal===contexto.sinal&&atual.current.api===contexto.api&&!contexto.sinal?.aborted;
 async function carregar(contexto={...atual.current}){
  const numero=++sequencia.current;
  try{const r=await api.listar();if(valido(contexto)&&numero===sequencia.current){setPainel({conta:contexto.conta,sinal:contexto.sinal,dados:r});setErro('');}}
  catch(e){if(valido(contexto)&&numero===sequencia.current){setPainel(null);setErro('Não foi possível consultar o suporte. Nenhuma correção foi confirmada.');if([401,403].includes(e?.status))acesso.negar?.();}}
 }
 useEffect(()=>{
  setPainel(null);setErro('');setAviso('');setConfirmacao(null);setFormularios({});setOcupado(false);emCurso.current=false;
  setPendentes({conta,itens:permitido?rascunhosSalvos(conta):{}});
  if(permitido)carregar({...atual.current});
  return()=>{sequencia.current++;};
 },[conta,sinal,permitido,api]);
 useEffect(()=>{const timer=setInterval(()=>setAgora(Date.now()),15000);return()=>clearInterval(timer);},[]);
 if(!permitido)return <section aria-label="Suporte remoto"><p role="status">Sem acesso ao suporte remoto.</p></section>;
 const dados=painel?.conta===conta&&painel.sinal===sinal?painel.dados:null;
 const habilitado=acesso.habilitado===true&&dados?.config?.habilitado===true;
 const preparadas=pendentes.conta===conta?pendentes.itens:{};
 const dispositivos=Array.isArray(dados?.dispositivos)?dados.dispositivos.filter(d=>idSeguro(d.usuario_id)&&idSeguro(d.instalacao_id)):[];
 function guardar(itens){gravarRascunhos(conta,itens);setPendentes({conta,itens});}
 async function enviar(d,args){
  if(emCurso.current||!habilitado||estadoDispositivo(d)!=='disponivel')return;
  emCurso.current=true;setOcupado(true);setErro('');setAviso('');const contexto={...atual.current};let despachado=false;
  try{
   // Persist the nonce before dispatch. A lost response must reuse this request.
   guardar({...preparadas,[d.instalacao_id]:args});
   despachado=true;await api.solicitar(args);
   if(!valido(contexto))return;
   const restantes={...preparadas};delete restantes[d.instalacao_id];guardar(restantes);
   setAviso('Solicitação registrada. Aguarde a confirmação do aparelho.');await carregar(contexto);
  }catch(e){if(valido(contexto)){setErro(!despachado?'Não foi possível guardar o identificador da solicitação neste navegador. Nenhuma solicitação foi enviada.':e?.code==='SUPORTE_RECUSADO'?'Solicitação recusada. Confira a disponibilidade, a autorização e o pedido original. Nenhuma correção foi confirmada.':'A resposta da solicitação não foi confirmada. Use Recuperar solicitação para consultar ou repetir o mesmo identificador. Não crie outro pedido para substituir este.');if([401,403].includes(e?.status)){setPainel(null);acesso.negar?.();}}}
  finally{if(valido(contexto)){emCurso.current=false;setOcupado(false);setConfirmacao(null);}}
 }
 function solicitar(d){
  if(preparadas[d.instalacao_id])return enviar(d,preparadas[d.instalacao_id]);
  const f=formularios[d.instalacao_id]||{tipo:'diagnostico',pedido:''};
  const pedido=f.pedido?.trim()||null;
  if(!Object.hasOwn(tipos,f.tipo)||pedido&&!idSeguro(pedido)||['consultar_recibo','reler_confirmacao'].includes(f.tipo)&&!pedido){setErro('Informe o UUID do pedido original para esta ação.');return;}
  const args={id:crypto.randomUUID(),atendimento:crypto.randomUUID(),usuario_id:d.usuario_id,instalacao_id:d.instalacao_id,tipo:f.tipo,pedido};
  if(['retomar_automaticas','solicitar_atualizacao'].includes(f.tipo)){setConfirmacao({d,args});return;}
  enviar(d,args);
 }
 async function cancelar(id){
  if(emCurso.current)return;emCurso.current=true;setOcupado(true);const contexto={...atual.current};setErro('');
  try{await api.cancelar(id);if(valido(contexto)){setAviso('Cancelamento solicitado. Uma execução já iniciada pode ter resultado incerto.');await carregar(contexto);}}
  catch{if(valido(contexto))setErro('Não foi possível confirmar o cancelamento. Consulte o histórico antes de repetir.');}
  finally{if(valido(contexto)){emCurso.current=false;setOcupado(false);}}
 }
 return <section className="suporte-remoto" aria-label="Suporte remoto">
  <div className="suporte-cabecalho"><div><h2>Suporte remoto</h2><p>Diagnóstico e solicitações limitados às filas do Integração.</p></div><button className="btn" disabled={ocupado} onClick={()=>carregar()}>Atualizar suporte</button></div>
  <p>O aplicativo do funcionário precisa estar atualizado, ativo, autenticado e conectado. Relato antigo ou sem contato significa estado desconhecido.</p>
  {!habilitado&&<p role="status" className="suporte-aviso">O suporte remoto está desativado. A ativação depende da revisão e autorização específicas.</p>}
  {erro&&<p role="alert" className="msg-erro">{erro}</p>}{aviso&&<p role="status">{aviso}</p>}
  {!dados&&<p role="status">Aguardando consulta autorizada.</p>}
  {dados&&<>
   <section aria-label="Dispositivos"><h3>Dispositivos</h3><p>As linhas representam instalações do aplicativo, não uma contagem comprovada de computadores físicos. A associação com um relato anterior é declarada pelo aplicativo.</p>{!dispositivos.length&&<p>Nenhum dispositivo registrado. Isso não comprova ausência de pendências.</p>}
    <div className="suporte-dispositivos">{dispositivos.map(d=>{
     const estado=estadoDispositivo(d,agora),disponivel=estado==='disponivel',f=formularios[d.instalacao_id]||{tipo:'diagnostico',pedido:''},preparada=preparadas[d.instalacao_id];
     const instanteRelato=Date.parse(d.ultimo_relato),relatoAntigo=Number.isFinite(instanteRelato)&&agora-instanteRelato>120000;
     const total=Number.isFinite(instanteRelato)&&Array.isArray(d.resumo)?d.resumo.reduce((n,g)=>n+(Number.isSafeInteger(g.quantidade)&&g.quantidade>=0?g.quantidade:0),0):null;
     return <article className="card suporte-dispositivo" key={d.instalacao_id} aria-label={`Dispositivo ${d.instalacao_id}`}>
      <h4>{typeof d.nome==='string'?d.nome.slice(0,100):'Usuário'}</h4><dl><dt>Instalação</dt><dd><code>{d.instalacao_id}</code></dd><dt>Versão</dt><dd>{typeof d.versao==='string'&&/^[a-zA-Z0-9._-]{1,64}$/.test(d.versao)?d.versao:'Não informada'}</dd><dt>{d.protocolo===1?'Último contato do suporte':'Contato do último relato'}</dt><dd>{hora(d.ultimo_contato)}</dd><dt>Aplicativo compatível</dt><dd>{d.protocolo===1?'Sim — protocolo de suporte 1':'Ainda não registrado no suporte'}</dd><dt>Horário do relato de sincronização</dt><dd>{hora(d.ultimo_relato)}</dd>{idSeguro(d.diagnostico_instalacao_id)&&<><dt>Relato associado</dt><dd><code>{d.diagnostico_instalacao_id}</code></dd></>}<dt>Disponibilidade</dt><dd>{disponivel?'Disponível para solicitação':estado==='incompativel'?'Aplicativo compatível ainda não registrado':estado==='antigo'?'Relato antigo — estado atual desconhecido':'Sem contato — estado desconhecido'}</dd><dt>{relatoAntigo?'Pendências no relato antigo':'Pendências no último relato'}</dt><dd>{total===null?'Não informadas':total}</dd></dl>
      <p>{total===null?'Ainda não há relato de fila disponível para esta instalação.':relatoAntigo?'O relato de fila está antigo; o estado atual das pendências é desconhecido.':'Uma contagem vazia é somente o último relato desta instalação.'}</p><ul>{(Array.isArray(d.resumo)?d.resumo:[]).slice(0,100).map((g,n)=><li key={n}>{modulos.has(g.modulo)?g.modulo:'outros'} · {estadosFila.has(g.estado)?g.estado:'Estado não reconhecido'} · {codigoSeguro(g.codigo)}: {Number.isSafeInteger(g.quantidade)&&g.quantidade>=0?g.quantidade:0}</li>)}</ul>
      <label className="rot" htmlFor={'suporte-acao-'+d.instalacao_id}>Ação</label><select className="inp" id={'suporte-acao-'+d.instalacao_id} value={f.tipo} disabled={ocupado||!!preparada||!habilitado||!disponivel} onChange={e=>setFormularios({...formularios,[d.instalacao_id]:{...f,tipo:e.target.value}})}>{Object.entries(tipos).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      <label className="rot" htmlFor={'suporte-pedido-'+d.instalacao_id}>UUID do pedido original</label><input className="inp" id={'suporte-pedido-'+d.instalacao_id} value={f.pedido} disabled={ocupado||!!preparada||!habilitado||!disponivel} placeholder="Opcional para diagnóstico" onChange={e=>setFormularios({...formularios,[d.instalacao_id]:{...f,pedido:e.target.value}})}/>
      {preparada&&<p role="status">Resposta anterior incerta. Identificador preservado: <code>{preparada.id}</code>.</p>}
      <button className="btn" disabled={ocupado||!habilitado||!disponivel} onClick={()=>solicitar(d)}>{preparada?'Recuperar solicitação':'Enviar solicitação'}</button>
     </article>;
    })}</div>
   </section>
   <section aria-label="Solicitações"><h3>Solicitações</h3><p>Resultado relatado pelo aparelho e presença de recibo no servidor são verificações diferentes.</p>
    {!(dados.solicitacoes||[]).length&&<p>Nenhuma solicitação registrada.</p>}
    {(Array.isArray(dados.solicitacoes)?dados.solicitacoes:[]).slice(0,100).map((s,n)=><article className="card suporte-solicitacao" key={idSeguro(s.id)||n}><h4>{Object.hasOwn(tipos,s.tipo)?tipos[s.tipo]:'Ação não reconhecida'} · {Object.hasOwn(estados,s.estado)?estados[s.estado]:'Estado não reconhecido'}</h4><p>Solicitação <code>{idSeguro(s.id)||'Identificador indisponível'}</code> · criada {hora(s.criado_em)} · validade {hora(s.expira_em)}</p><p>Conta alvo: <code>{idSeguro(s.usuario_id)||'Não informada'}</code> · instalação: <code>{idSeguro(s.instalacao_id)||'Não informada'}</code></p>{idSeguro(s.pedido)&&<p>Pedido original: <code>{s.pedido}</code></p>}<Resultado resultado={s.resultado} reciboNoServidor={s.recibo_no_servidor}/>{idSeguro(s.id)&&['criada','recebida','iniciada'].includes(s.estado)&&<button className="btn btn-sm" disabled={ocupado||!habilitado} onClick={()=>cancelar(s.id)}>Solicitar cancelamento</button>}</article>)}
   </section>
   <section aria-label="Auditoria do suporte"><h3>Auditoria do suporte</h3><p>Registros técnicos preservados. A interface não permite apagar ou editar a auditoria.</p><ul>{(Array.isArray(dados.auditoria)?dados.auditoria:[]).slice(0,100).map((a,n)=><li key={idSeguro(a.id)||n}>{hora(a.em)} · {eventoSeguro(a.evento)} · solicitação <code>{idSeguro(a.solicitacao_id)||'Identificador indisponível'}</code> · ator <code>{idSeguro(a.ator)||'Não informado'}</code></li>)}</ul></section>
  </>}
  {confirmacao&&<section className="card suporte-confirmacao" role="group" aria-label="Confirmar solicitação de suporte"><h3>Confirmar solicitação</h3><p>{tipos[confirmacao.args.tipo]} para a instalação <code>{confirmacao.args.instalacao_id}</code>{confirmacao.args.pedido?<> e pedido <code>{confirmacao.args.pedido}</code></>:null}.</p><p>{confirmacao.args.tipo==='solicitar_atualizacao'?'O funcionário receberá uma orientação local. A tela não será recarregada à força.':'Somente as tentativas permitidas pelo protocolo serão retomadas. Bloqueios exigem revisão; pedidos com recibo fazem apenas releitura.'}</p><button className="btn btn-primario" disabled={ocupado} onClick={()=>enviar(confirmacao.d,confirmacao.args)}>Confirmar para este aparelho</button><button className="btn" disabled={ocupado} onClick={()=>setConfirmacao(null)}>Voltar sem solicitar</button></section>}
 </section>;
}
