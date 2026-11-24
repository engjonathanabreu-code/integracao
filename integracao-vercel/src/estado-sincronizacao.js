import {restricaoDaFalha,orientacaoRestricao} from './diagnostico-validacao.js';
export const terminal=i=>['confirmado','substituido','dispensado'].includes(i.estado);
export const requerRevisaoFila=i=>!terminal(i)&&(i.estado.startsWith('bloqueado')||['persistencia_falhou','legado_revisao'].includes(i.estado)||i.proximaTentativa===Number.MAX_SAFE_INTEGER);
// Network/transport failures carry no server verdict, so they never require review.
const NOMES_TRANSPORTE=['AbortError','TimeoutError','NetworkError'];
const redeTypeError=e=>e?.name==='TypeError'&&/fetch|network|load failed|conex/i.test(String(e.message||''));
// Only string codes are SQLSTATE/PostgREST/application codes. DOMException.code
// is a legacy number (TimeoutError=23, AbortError=20), never a SQLSTATE.
const codigoTexto=e=>typeof e?.code==='string'&&e.code?e.code:undefined;
const REGISTRO_INDISPONIVEL=/registro indispon[ií]vel/i;
export function classificarFalha(e){
 const restricao=restricaoDaFalha(e);
 const vistos=new Set(),nomes=new Set(),mensagens=[];let status,codigo,rede=false;
 while(e&&!vistos.has(e)){
  vistos.add(e);status??=e.status;codigo??=codigoTexto(e);nomes.add(e.name);
  if(NOMES_TRANSPORTE.includes(e.name)||redeTypeError(e))rede=true;
  for(const m of [e.message,e.details])if(typeof m==='string')mensagens.push(m);
  e=e.cause;
 }
 status=Number(status);codigo=String(codigo||'TRANSPORTE').slice(0,60);
 const categoria=status===401||['SESSAO_EXPIRADA','SESSAO_AUSENTE','PGRST301','PGRST302','PGRST303'].includes(codigo)||mensagens.some(m=>/JWT expired/i.test(m))?'sessao'
  :status===403||codigo==='42501'?'permissao'
  :codigo.startsWith('PERSISTENCIA')||['QuotaExceededError','InvalidStateError'].some(n=>nomes.has(n))?'armazenamento'
  :codigo==='LEITURA_DIVERGENTE'?'leitura'
  :codigo==='P0001'&&mensagens.some(m=>REGISTRO_INDISPONIVEL.test(m))?'registro_indisponivel'
  :['P0001','INTENCAO_SEM_OPERACOES'].includes(codigo)?'validacao'
  :status===409||codigo==='PT409'?'conflito'
  :rede&&!Number.isFinite(status)?'transitoria'
  :[400,404,422].includes(status)||/^(22|23)/.test(codigo)?'validacao':'transitoria';
 return {status:Number.isFinite(status)?status:null,codigo,categoria,...(restricao?{restricao}:{})};
}
// Only a 500 that carries a real SQLSTATE outside the transient classes
// (connection 08, transaction 25/40, resources 53, lock 55, operator 57, system
// 58, internal XX) may be treated as deterministic once it repeats unchanged for
// long enough. A 500 without SQLSTATE (gateway, auth, empty body) never is.
export const erroServidorDeterministico=(status,codigo)=>status===500&&/^[0-9A-Z]{5}$/.test(String(codigo||''))&&!/^(08|25|40|53|55|57|58|XX)/.test(String(codigo));
// C1 backoff, based on consecutive failures (also before any send).
export const atrasoRetentativa=(falhas,retryAfterMs=0,aleatorio=Math.random)=>
 Math.max(Number(retryAfterMs)||0,Math.min(300000,1000*2**Math.min(Math.max(falhas||0,0),9))*(.5+aleatorio()*.5));
// UI hint only: a long transient streak is late, never a review requirement.
export const itemAtrasado=i=>!terminal(i)&&!requerRevisaoFila(i)&&(i.falhas||0)>=8;
// Before phase tracking, a receipt failure could be mistaken for rejection.
// A previously sent entry without proof remains uncertain, including old queues.
export const revisaoDeRecusa=i=>['bloqueado_conflito','bloqueado_validacao'].includes(i.estado)&&i.erro?.rejeicaoConfirmada!==false&&i.erro?.categoria!=='sessao'&&!(i.enviadoEm&&i.erro&&!Object.hasOwn(i.erro,'rejeicaoConfirmada'));
// C1/C5: a transient or session failure without a server refusal may become
// eligible again. Old clients stored 401 as a "confirmed" rejection; a session
// failure is never a business refusal. Leases, receipts and payloads are kept.
export function retomavelTransitoria(i,agora){
 const categoria=i?.erro?.categoria;
 return !!i&&!terminal(i)&&!(i.leaseAte>agora)&&['transitoria','sessao'].includes(categoria)&&
  !['persistencia_falhou','legado_revisao'].includes(i.estado)&&!revisaoDeRecusa(i)&&
  (categoria==='sessao'||i.erro.rejeicaoConfirmada!==true);
}
// Eligible state for a resumed item: same identity, payload, receipt and phase.
export const estadoRetomado=i=>i.estado.startsWith('bloqueado')?i.recibo?'confirmado_aguardando_leitura':i.payload?'resultado_desconhecido':'pendente_local':i.estado;
// C5: why a non-terminal item is waiting on another one. Follows replacements,
// explicit dependencies and earlier entries of the same unit down to the root.
export function motivoEspera(item,items=[]){
 if(!item||terminal(item))return null;
 const porId=new Map(items.map(i=>[i.id,i]));
 const resolver=id=>{let d=porId.get(id);const vistos=new Set();while(d?.substituidaPor&&!vistos.has(d.id)){vistos.add(d.id);d=porId.get(d.substituidaPor);}return d||{id,estado:'ausente'};};
 const bloqueios=i=>{
  const deps=(i.escopoArquivos?.dependencias||i.dependencias||i.original?.dependencias||[]).map(resolver);
  const unidade=i.original?.unidade?items.filter(a=>a.ordem<i.ordem&&a.original?.unidade===i.original.unidade):[];
  return [...deps,...unidade].filter(d=>d.estado==='ausente'||!terminal(d)&&d.id!==i.id);
 };
 const direto=bloqueios(item)[0];
 if(!direto)return null;
 let raiz=direto;const vistos=new Set([item.id]);
 while(!vistos.has(raiz.id)){vistos.add(raiz.id);const prox=raiz.estado==='ausente'?null:bloqueios(raiz).find(d=>!vistos.has(d.id));if(!prox)break;raiz=prox;}
 return {tipo:'dependencia',itemId:direto.id,causaRaiz:{itemId:raiz.id,estado:raiz.estado,categoria:raiz.erro?.categoria??null,codigo:raiz.erro?.codigo??null}};
}
// An explicit confirmation click may reopen only the same exhausted client
// request after a transport failure. Existing leases, cooldowns, receipts,
// definitive failures and all other intents retain their original behavior.
const alteracaoCadastro=(i,auditoriaId=null)=>i.original?.modulo==='processos'&&
 i.original?.intencao?.edicoes?.some(a=>a.colecao==='auditoria'&&typeof a.id==='string'&&!!a.id&&
   (auditoriaId===null||a.id===auditoriaId)&&a.antes?.existe===false&&a.depois?.existe===true&&
   a.depois.valor?.id===a.id&&a.depois.valor?.acao==='Cadastro alterado')===true;
export function podeRearmarCadastro(i, auditoriaId, agora){
 const e=i?.erro;
 return typeof auditoriaId==='string'&&!!auditoriaId&&i?.original?.modulo==='processos'&&
  i.estado==='resultado_desconhecido'&&!i.recibo&&!(i.leaseAte>agora)&&
  i.proximaTentativa===Number.MAX_SAFE_INTEGER&&e?.categoria==='transitoria'&&
  e.codigo==='TRANSPORTE'&&e.rejeicaoConfirmada===false&&
  (e.status===null||[408,500,502,503,504].includes(e.status))&&alteracaoCadastro(i,auditoriaId);
}
// Distinguish a failed preparation from a save with no confirmed outcome.
export function falhaPreparacaoSemEnvio(i){
 const e=i?.erro,o=i?.original;
 return !!(i?.estado==='resultado_desconhecido'&&(!i.fase||i.fase==='preparacao')&&
  e?.fase==='preparacao'&&e.codigo==='TRANSPORTE'&&e.categoria==='transitoria'&&
  e.rejeicaoConfirmada===false&&(e.status===null||[408,500,502,503,504].includes(e.status))&&
  o?.preparar===true&&!o.legado&&Array.isArray(o.operacoes)&&o.operacoes.length===0&&
  i.tentativas===0&&i.tentativasTotais===0&&i.payload==null&&i.preparado==null&&
  i.enviadoEm==null&&i.recibo==null&&i.confirmadoEm==null&&i.lidoEm==null);
}
// Only the diagnosed pre-send Cadastro flow needs a progressively longer
// pause. Other modules retain their existing retry and review timing.
export const ciclosBackoffIntencao=i=>falhaPreparacaoSemEnvio(i)&&alteracaoCadastro(i)?i.falhas:i.tentativas;
export const podeVerificarPreparacaoAoReconectar=(i,agora)=>
 falhaPreparacaoSemEnvio(i)&&!i.verificadaAoReconectar&&
 i.original?.intencao?.edicoes?.some(e=>podeRearmarCadastro(i,e.id,agora))===true;
// A bounded repair of exhausted read-back only. It cannot prepare or resend a
// payload, waive dependencies, change the original, or accept a divergent read.
export function podeRetomarReleitura(i,agora){
 return i?.estado==='confirmado_aguardando_leitura'&&!!i.recibo&&
  Array.isArray(i.payload)&&i.payload.length>0&&i.proximaTentativa===Number.MAX_SAFE_INTEGER&&
  !(i.leaseAte>agora)&&!i.releituraTemporariaVerificada&&!i.releituraDivergenteVerificada&&
  i.erro?.fase==='releitura'&&i.erro.categoria==='transitoria'&&
  i.erro.codigo==='TRANSPORTE'&&(i.erro.status==null||[408,429,500,502,503,504].includes(i.erro.status));
}
// Some historical receipts exhausted ordinary read-back while fields were
// eventually consistent or a former projection differed. Give only that
// existing receipt one fresh comparison after this repair, never a replay.
export function podeRetomarReleituraDivergente(i,agora){
 return i?.estado==='confirmado_aguardando_leitura'&&!!i.recibo&&
  Array.isArray(i.payload)&&i.payload.length>0&&
  i.preparado?.antes!=null&&i.preparado?.depois!=null&&
  i.proximaTentativa===Number.MAX_SAFE_INTEGER&&!(i.leaseAte>agora)&&!i.releituraDivergenteVerificada&&
  i.erro?.fase==='releitura'&&i.erro.codigo==='LEITURA_DIVERGENTE'&&i.erro.categoria==='leitura';
}
export const podeRetomarLeituraAutomaticamente=(i,agora)=>podeRetomarReleitura(i,agora)||podeRetomarReleituraDivergente(i,agora);
export function orientacaoPendencia(i){
 if(i.erro?.repetida)return 'O servidor devolveu o mesmo erro interno várias vezes ao gravar esta alteração. Ela continua guardada neste aparelho e não foi confirmada. Tente retomar mais tarde; se o erro persistir, informe o suporte antes de descartar.';
 if(i.erro?.codigo==='CLIENTE_SEM_VINCULO_CANONICO')return 'Este cadastro não tem vínculo confirmado no servidor. A alteração não foi enviada nesta tentativa e continua neste aparelho. Confira o cadastro com a equipe autorizada antes de retomar; não crie outra ficha.';
 if(i.erro?.codigo==='INTENCAO_SEM_OPERACOES')return 'A preparação não produziu operações de gravação verificáveis. Não há confirmação do servidor para esta alteração; o original permanece preservado para revisão.';
 if(!i.recibo&&i.erro?.categoria==='registro_indisponivel')return 'O registro foi apagado ou não está disponível para esta conta. Recrie o registro ou descarte esta alteração; o original continua preservado.';
 if(!i.recibo&&i.erro?.codigo==='P0001')return 'Este pedido exige revisão. O código P0001 não identifica sozinho a regra ou o campo; o original continua preservado.';
 if(falhaPreparacaoSemEnvio(i))return 'O sistema falhou antes de enviar esta alteração. O rascunho continua preservado neste aparelho.';
 if(i.estado==='legado_revisao')return 'O rascunho antigo precisa de análise. Baixe o original preservado; ele não será reenviado automaticamente.';
 const categoria=i.erro?.categoria||classificarFalha({status:i.erro?.status,code:i.erro?.codigo}).categoria;
 if(categoria==='sessao')return 'Entre novamente na mesma conta e retome este pedido. As alterações continuam preservadas.';
 if(categoria==='permissao')return 'Esta conta não tem permissão. Solicite revisão a um perfil autorizado; a regra de acesso continua válida.';
 if(i.estado.startsWith('bloqueado')&&!revisaoDeRecusa(i))return 'A recusa da gravação não foi comprovada. Retome o pedido original para consultar seu recibo.';
 if(categoria==='armazenamento'||i.estado==='persistencia_falhou')return 'O navegador não guardou a alteração. Baixe uma cópia antes de sair e verifique o armazenamento.';
 if(i.recibo)return 'A gravação tem recibo. A retomada fará somente a leitura de confirmação. Se os valores atuais divergirem, confira a prévia antes de reconhecê-los; o original será preservado.';
 if(i.estado==='resultado_desconhecido')return 'O resultado ainda é desconhecido. A retomada consultará o recibo antes de repetir o mesmo pedido.';
 if(categoria==='conflito')return 'Compare a base original, sua alteração e o valor compartilhado antes de escolher.';
 if(categoria==='validacao')return [orientacaoRestricao(i.erro?.restricao),'Revise os campos e vínculos do cadastro. Confirme a correção somente nesta alteração.'].filter(Boolean).join(' ');
 if(itemAtrasado(i))return 'O envio está atrasado por falhas temporárias de conexão. As alterações continuam preservadas e serão tentadas novamente automaticamente.';
 return 'As alterações continuam preservadas; falhas temporárias são tentadas novamente com intervalos crescentes.';
}
