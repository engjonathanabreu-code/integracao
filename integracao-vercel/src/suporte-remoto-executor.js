import {capturarSessao as capturarSessaoReal} from './dados-compartilhados.js';
import {instalacaoDiagnostico,VERSAO_CLIENTE} from './diagnostico-sincronizacao.js';
import {restricaoPermitida} from './diagnostico-validacao.js';
import {temEdicaoEmAndamento} from './protecao-edicao.js';
import {suporteRemotoApi,SUPORTE_REMOTO_HABILITADO} from './suporte-remoto-api.js';
import {obterVinculoSuporte} from './suporte-remoto-vinculo.js';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const tipos=new Set(['diagnostico','consultar_recibo','retomar_automaticas','reler_confirmacao','solicitar_atualizacao','revisar_bloqueios']);
const estados=new Set(['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura','bloqueado_conflito','bloqueado_validacao','persistencia_falhou','legado_revisao','confirmado','dispensado','substituido']);
const fases=new Set(['preparacao','envio','recibo','releitura']);
const codigos=new Set(['SEM_ERRO','OUTRO','SESSAO_EXPIRADA','SESSAO_AUSENTE','TRANSPORTE','LEITURA_DIVERGENTE','ARQUIVO_LOCAL_AUSENTE','RESPONSAVEL_INDISPONIVEL','IDENTIDADE_OUTRA_META','PERSISTENCIA_INDISPONIVEL','PERSISTENCIA_ABORTADA','FILA_BLOQUEADA']);
const esperas=new Set(['nao_verificado','encerrado','revisao','retomada_manual','intervalo_de_tentativa','reserva_ativa','pedido_anterior','dependencia','pronto_para_verificacao']);
const resultados=new Set(['DIAGNOSTICO','RECIBO_LOCAL','RECIBO_ENCONTRADO','SEM_RECIBO','LEITURA_CONFIRMADA','LEITURA_DIVERGENTE','REVISAO_NECESSARIA','EM_ANDAMENTO','ATUALIZACAO_SOLICITADA','SESSAO_ALTERADA','SEM_ALTERACAO','PERSISTENCIA_INDISPONIVEL','ARQUIVO_LOCAL_AUSENTE','RESULTADO_INCERTO','PEDIDO_AUSENTE']);
const interrompida=()=>Object.assign(Error('A execução de suporte foi interrompida.'),{code:'SESSAO_ALTERADA'});
const objeto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

// Use a positive schema even for results produced locally. A thrown error,
// receipt, original or newly-added journal property must never become telemetry.
export function sanitizarResultadoSuporte(resultado){
 const codigo=resultados.has(resultado?.codigo)?resultado.codigo:'RESULTADO_INCERTO';
 const itens=(Array.isArray(resultado?.itens)?resultado.itens:[]).slice(0,100).filter(i=>objeto(i)&&uuid(i.id)&&uuid(i.pedido)).map(i=>({
  id:i.id,pedido:i.pedido,estado:estados.has(i.estado)?i.estado:'legado_revisao',
  codigo:codigos.has(i.codigo)||typeof i.codigo==='string'&&/^[0-9A-Z]{5}$/.test(i.codigo)?i.codigo:'OUTRO',
  fase:fases.has(i.fase)?i.fase:null,tentativas:Number.isSafeInteger(i.tentativas)&&i.tentativas>=0&&i.tentativas<=1000000?i.tentativas:0,
  temRecibo:i.temRecibo===true,dependencias:(Array.isArray(i.dependencias)?i.dependencias:[]).filter(uuid).slice(0,100),
  restricao:restricaoPermitida(i.restricao),espera:esperas.has(i.espera)?i.espera:'nao_verificado'
 }));
 return {codigo,itens};
}

export function criarExecutorSuporte({usuario,api=suporteRemotoApi,sync,capturarSessao=capturarSessaoReal,agora=Date.now,
 habilitado=SUPORTE_REMOTO_HABILITADO,obterVinculo=obterVinculoSuporte,diagnosticoInstalacao=()=>instalacaoDiagnostico(),consumidor=crypto.randomUUID(),
 versao=VERSAO_CLIENTE,ativo=()=>true,ambiente=()=>globalThis.navigator?.onLine!==false&&globalThis.document?.visibilityState!=='hidden',onAtualizacao=()=>{}}={}){
 const owner=typeof usuario==='string'?usuario:usuario?.erpRef;
 const obterSync=typeof sync==='function'?sync:()=>sync;
 let encerrado=false,emCurso=false,vinculo;
 const vistos=new Set();
 function conferir(scope,comando){
  if(encerrado||!ativo()||!ambiente()||scope.signal?.aborted||scope.owner!==owner)throw interrompida();
  scope.conferir();
  if(comando&&(!Number.isFinite(Date.parse(comando.expira_em))||Date.parse(comando.expira_em)<=agora()))throw interrompida();
 }
 async function passo(){
  if(!habilitado||encerrado||emCurso||!uuid(owner)||!uuid(consumidor)||!ambiente()||!obterSync()?.diagnosticoPronto?.())return null;
  emCurso=true;let scope,comando,iniciada=false,efeitoIniciado=false,conclusaoEnviada=false;
  try{
   scope=capturarSessao();conferir(scope);
   vinculo??=await obterVinculo(owner,{capturarSessao});conferir(scope);
   if(vinculo?.conta!==owner||!uuid(vinculo?.instalacao_id)||!/^[0-9a-f]{64}$/.test(vinculo?.prova_instalacao||''))return null;
   const instalacaoId=vinculo.instalacao_id,prova_instalacao=vinculo.prova_instalacao;
   const diagnosticoId=typeof diagnosticoInstalacao==='function'?diagnosticoInstalacao():diagnosticoInstalacao;
   if(!uuid(diagnosticoId))return null;
   const chamar=async(acao,args,c=comando)=>{conferir(scope,c);const r=await api.chamar(acao,args,{signal:scope.signal});conferir(scope,c);return r;};
   const contato=await chamar('contatar',{instalacao_id:instalacaoId,diagnostico_instalacao_id:diagnosticoId,prova_instalacao,versao,protocolo:1});
   if(contato?.habilitado===false||!ambiente())return null;
   const entrega=await chamar('receber',{instalacao_id:instalacaoId,prova_instalacao,consumidor});
   if(entrega?.habilitado===false||!entrega?.comando)return null;
   comando=entrega.comando;
   if(!objeto(comando)||!uuid(comando.id)||comando.usuario_id!==owner||comando.instalacao_id!==instalacaoId||!tipos.has(comando.tipo)||
    (comando.pedido!=null&&!uuid(comando.pedido))||(['consultar_recibo','reler_confirmacao'].includes(comando.tipo)&&!uuid(comando.pedido)))return null;
   conferir(scope,comando);
   if(vistos.has(comando.id))return null;
   // Remember before authorizing. If its response is lost, this instance never
   // retries authorization or the effect. The server also never redelivers an
   // expired started lease, including after the browser is reopened.
   vistos.add(comando.id);
   const alvo={id:comando.id,instalacao_id:instalacaoId,prova_instalacao,consumidor};
   const autorizacao=await chamar('autorizar',alvo);
   if(autorizacao?.autorizado!==true)return null;
   iniciada=true;conferir(scope,comando);
   const revalidar=async()=>{const r=await chamar('validar_execucao',alvo);if(r?.autorizado!==true)throw Object.assign(Error('Solicitação não autorizada.'),{code:'SUPORTE_RECUSADO'});};
   await revalidar();
   efeitoIniciado=true;
   const resultado=sanitizarResultadoSuporte(await obterSync().executarSuporte({tipo:comando.tipo,pedido:comando.pedido||null},()=>conferir(scope,comando),revalidar));
   conferir(scope,comando);
   const estado=resultado.codigo==='RESULTADO_INCERTO'?'resultado_incerto':'concluida';
   conclusaoEnviada=true;const ack=await chamar('concluir',{...alvo,estado,resultado});
   conferir(scope,comando);
   if(ack?.aceito!==true)return {estado:'resultado_incerto',resultado:{codigo:'RESULTADO_INCERTO',itens:[]}};
   if(comando.tipo==='solicitar_atualizacao'&&resultado.codigo==='ATUALIZACAO_SOLICITADA')onAtualizacao();
   return {estado,resultado};
  }catch(e){
   // Never acknowledge into another account. A stale/expired execution is left
   // to the server's lease/expiry audit, without reporting a fabricated success.
   try{if(scope)conferir(scope,comando);else return null;}catch{return null;}
   if(iniciada&&comando){
    const recusadaSemEfeito=e?.code==='SUPORTE_RECUSADO'&&!efeitoIniciado&&!conclusaoEnviada;
    const resultado={codigo:recusadaSemEfeito?'REVISAO_NECESSARIA':'RESULTADO_INCERTO',itens:[]};
    const estado=resultado.codigo==='REVISAO_NECESSARIA'?'negada':'resultado_incerto';
    if(!conclusaoEnviada)try{await api.chamar('concluir',{id:comando.id,instalacao_id:vinculo.instalacao_id,prova_instalacao:vinculo.prova_instalacao,consumidor,estado,resultado},{signal:scope.signal});conferir(scope,comando);}catch{}
    return {estado,resultado};
   }
   return null;
  }finally{emCurso=false;}
 }
 return {passo,step:passo,fechar:()=>{encerrado=true;},get executando(){return emCurso;}};
}

// A support request only displays a local notice. This separate user action can
// reload after the hook proves a recoverable, idle state and the session is still
// the same. Re-check editing after the asynchronous persistence verification.
export async function atualizarSuporteComSeguranca({owner,sync,capturarSessao=capturarSessaoReal,emEdicao=temEdicaoEmAndamento,recarregar=()=>globalThis.location.reload()}){
 const scope=capturarSessao();
 const conferir=()=>{scope.conferir();if(scope.owner!==owner||scope.signal?.aborted)throw interrompida();};
 conferir();if(emEdicao())return false;
 const pronto=await sync.prepararAtualizacaoSuporte();conferir();
 if(pronto!==true||emEdicao())return false;
 recarregar();return true;
}
