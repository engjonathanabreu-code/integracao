import {restricaoDaFalha,orientacaoRestricao,regraDaFalha,orientacaoRegra} from './diagnostico-validacao.js';
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
 const restricao=restricaoDaFalha(e),regra=regraDaFalha(e)?.regra;
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
  :['P0001','23514','23P01','INTENCAO_SEM_OPERACOES'].includes(codigo)?'validacao'
  :status===409||codigo==='PT409'?'conflito'
  :rede&&!Number.isFinite(status)?'transitoria'
  :[400,404,422].includes(status)||/^(22|23)/.test(codigo)?'validacao':'transitoria';
 // `regra` is a fixed local key (REGRAS_VALIDACAO); server text is never kept.
 return {status:Number.isFinite(status)?status:null,codigo,categoria,...(restricao?{restricao}:{}),...(regra?{regra}:{})};
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
// A b…4326 tokens truncated…stado));
   const esperadas=new Set(dependenciasEfetivasDaIntencao(ultima));
   const presa=i=>vivos.some(x=>x.ordem>i.ordem&&x.ordem<ultima.ordem&&(recursosEfetivosDaIntencao(x).includes(recurso)||esperadas.has(x.id)&&dependenciasEfetivasDaIntencao(x).includes(i.id)));
   const ultimaPresa=grupo.slice(0,-1).reduce((n,i,k)=>presa(i)?k:n,-1);
   const superadas=grupo.slice(ultimaPresa+1,-1).filter(i=>!i.original.substitui&&!i.recibo&&!(i.leaseAte>tempo)&&(nuncaEnviada(i)||revisaoDeRecusa(i)));
   if(!superadas.length)continue;
   const ids=new Set(superadas.map(i=>i.id));
   // The survivor must not wait on what it supersedes; it keeps every other
   // ordering constraint those versions had.
   const herdar=lista=>[...new Set([...lista,...superadas.flatMap(dependenciasEfetivasDaIntencao)])].filter(id=>!ids.has(id)&&id!==ultima.id);
   ultima.dependencias=herdar(ultima.dependencias||ultima.original.dependencias||[]);
   if(ultima.escopoArquivos?.versao===1)ultima.escopoArquivos={...ultima.escopoArquivos,dependencias:herdar(ultima.escopoArquivos.dependencias||[])};
   for(const i of superadas){
    i.decisao={tipo:'versao_de_arquivo_superada',em:tempo,por:ultima.id,estadoAnterior:i.estado};
    i.estado='substituido';i.substituidaPor=ultima.id;i.atualizadoEm=tempo;
    await requisicao(s.intencoes.put(i));total++;
   }
   await requisicao(s.intencoes.put(ultima));
  }
  return total;
 }
 async function listar(conta){contaValida(conta);await migrarConta(conta);return transacao('readonly',async s=>(await requisicao(s.intencoes.index('conta').getAll(conta))).sort((a,b)=>a.ordem-b.ordem));}
 // Freeze safe scopes even when their own real dependencies are still blocked.
 // Otherwise an already persisted file-only successor can never reach selection.
 async function congelarEscopos(s,items,tempo=agora()){
  for(const item of items.sort((a,b)=>a.ordem-b.ordem)){
   if(item.escopoArquivos||item.leaseAte>tempo)continue;
   const escopo=escopoArquivosDaIntencao(item,items);
   if(escopo){item.escopoArquivos=escopo;await requisicao(s.intencoes.put(item));}
  }
 }
 async function enfileirar({conta,id=crypto.randomUUID(),unidade,modulo,dependencias=[],operacoes,base,intencao,preparar=false,recursos=[unidade],referencias=[],criadas=[],legado=null,substituirId=null,retomadaRemota=null}){
  contaValida(conta);
  if(!unidade||!modulo||!Array.isArray(operacoes)||(!operacoes.length&&!preparar)||dependencias.includes(id))throw erro('Unidade, módulo ou operações inválidos.','INTENCAO_INVALIDA');
  // Copy before the first await; callers may keep editing their objects.
  const original=structuredClone({protocolo:PROTOCOLO,unidade,modulo,dependencias:[...new Set(dependencias)],operacoes,base,intencao,preparar,recursos,referencias,criadas});
  if(substituirId)original.substitui=substituirId;
  canonico(original);
  const checksum=await checksumIntencao(original);
  await migrarConta(conta);
  return transacao('readwrite',async s=>{
   const existente=await requisicao(s.intencoes.get([conta,id]));
   if(existente){if(existente.checksum!==checksum)throw erro('A mesma intenção foi reutilizada com outro conteúdo.','PEDIDO_DIVERGENTE');return existente;}
   const substituida=substituirId?await requisicao(s.intencoes.get([conta,substituirId])):null;
   if(substituirId&&(!substituida||substituirId===id||substituida.recibo||substituida.leaseAte>agora()||!revisaoDeRecusa(substituida)))throw erro('Revisão mudou; atualize a prévia.','REVISAO_NECESSARIA');
   for(const dep of original.dependencias)if(!await requisicao(s.intencoes.get([conta,dep])))throw erro('Dependência indisponível nesta conta.','DEPENDENCIA_INDISPONIVEL');
   const anteriores=await requisicao(s.intencoes.index('conta').getAll(conta));
   if(retomadaRemota){
    retomadaRemota.verificar();
    if(!elegivelRetomadaCrm(substituida,{conta,pedido:substituirId,revisao:retomadaRemota.revisao,agora:agora()})||motivoEspera(substituida,anteriores))
     throw erro('Revisão mudou; a retomada remota não foi registrada.','REVISAO_NECESSARIA');
   }
   // Persist proven pre-send scopes before capturing successor resources. The
   // removed attachment must not reappear if its unrelated data edit later fails.
   await congelarEscopos(s,anteriores);
   // Append order and dependency capture share the same transaction across tabs.
   const deps=anteriores.filter(x=>!['confirmado','substituido','dispensado'].includes(x.estado)&&(x.original.unidade===unidade||recursosEfetivosDaIntencao(x).some(r=>recursos.includes(r))||x.original.criadas?.some(r=>referencias.includes(r)))).map(x=>x.id);
   const seq=await requisicao(s.sequencias.get(conta));
   const item={conta,id,pedido:id,checksum,original,ordem:(seq?.valor||0)+1,estado:'pendente_local',clienteVersao:VERSAO_CLIENTE,tentativas:0,tentativasTotais:0,criadoEm:agora(),atualizadoEm:agora(),proximaTentativa:0,dependencias:[...new Set([...original.dependencias,...deps])]};
   if(substituida){
    item.dependencias=dependenciasEfetivasDaIntencao(substituida);item.ordem=substituida.ordem;
    if(retomadaRemota)retomadaRemota.verificar();
    substituida.estado='substituido';substituida.substituidaPor=id;
    await requisicao(s.intencoes.put(substituida));
   }
   if(legado){item.payload=structuredClone(operacoes);item.preparado={antes:legado.before,depois:legado.after,sent:legado.sent||{}};item.estado=legado.confirmacao?'confirmado_aguardando_leitura':legado.rejeitada?'bloqueado_validacao':'resultado_desconhecido';if(legado.confirmacao)item.recibo=structuredClone(legado.confirmacao);}
   await requisicao(s.sequencias.put({conta,valor:(seq?.valor||0)+1}));await requisicao(s.intencoes.add(item));
   if(!arquivoUnicoDaIntencao(item))return item;
   // Reread: earlier copies in this transaction may predate a replacement.
   await coalescerArquivos(s,await requisicao(s.intencoes.index('conta').getAll(conta)));
   return requisicao(s.intencoes.get([conta,id]));
  });
 }
 async function reservar(conta,{dono,leaseMs=60000,somenteId=null,somenteLeitura=false,exigirRecibo=false,somenteConvergencia=false,ignorarIds=[]}={}){
  contaValida(conta);if(!dono||leaseMs<1000)throw erro('Consumidor inválido.','CONSUMIDOR_INVALIDO');
  await migrarConta(conta);
  return transacao('readwrite',async s=>{
   const items=(await requisicao(s.intencoes.index('conta').getAll(conta))).sort((a,b)=>a.ordem-b.ordem),tempo=agora();
   for(const item of items)if(!somenteLeitura&&(!somenteId||item.id===somenteId)&&!(item.leaseAte>tempo)&&pendenciaSomenteLocal(item)){
    item.estado='dispensado';item.decisao={tipo:item.original.intencao.edicoes.some(edicaoDerivada)?'somente_projecao_derivada_local':'somente_presenca_ou_acesso_local',em:tempo};
    await requisicao(s.intencoes.put(item));
   }
   if(!somenteLeitura){await coalescerArquivos(s,items,tempo);await congelarEscopos(s,items,tempo);}
   for(const item of items){
    if(somenteId&&item.id!==somenteId)continue;
    if(ignorarIds.includes(item.id))continue;
    const elegivel=['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura'].includes(item.estado)||somenteLeitura&&['bloqueado_validacao','bloqueado_conflito'].includes(item.estado);
    if(item.leaseAte>tempo||!elegivel||somenteConvergencia&&!conflitoReconciliavelMetas(item,tempo)&&!conflitoArquivoReconciliavel(item,tempo)&&!conflitoReconciliavelPreferencias(item,tempo)&&!recusadoComReciboConsultavel(item,tempo)||somenteLeitura&&!somenteConvergencia&&(!item.payload||exigirRecibo&&!item.recibo))continue;
    // One read-only retry after this repair, even when the old code exhausted
    // its attempts. The marker is committed together with the existing lease.
    const reabrirReleitura=!somenteLeitura&&!somenteId&&item.proximaTentativa===Number.MAX_SAFE_INTEGER&&
     item.estado==='confirmado_aguardando_leitura'&&item.erro?.codigo==='LEITURA_DIVERGENTE'&&
     !item.releituraRetencaoVerificada&&!item.releituraDivergenteVerificada&&estruturaReleituraNotificacoesLegadas(item,conta);
    if(!somenteLeitura&&item.proximaTentativa>tempo&&!reabrirReleitura)continue;
    if(items.some(antes=>antes.ordem<item.ordem&&antes.original.unidade===item.original.unidade&&!['confirmado','substituido','dispensado'].includes(antes.estado)))continue;
    const resolver=id=>{let d=items.find(i=>i.id===id);const vistos=new Set();while(d?.substituidaPor&&!vistos.has(d.id)){vistos.add(d.id);d=items.find(i=>i.id===d.substituidaPor);}return d;};
    const escopo=escopoArquivosDaIntencao(item,items);
    const deps=(escopo?.dependencias||item.dependencias||item.original.dependencias).map(resolver);
    if(deps.some(d=>!d||!['confirmado','dispensado'].includes(d.estado)))continue;
    if(!item.payload&&!item.original.preparar){
     const aliases=Object.assign({},...deps.map(d=>d.recibo?.aliases||{}));
     item.payload=remapearIdentidades(item.original.operacoes,aliases);
    }
    if(escopo&&!item.escopoArquivos)item.escopoArquivos=escopo;
    if(!somenteConvergencia)item.fase=!item.payload?'preparacao':item.estado==='confirmado_aguardando_leitura'?'releitura':item.estado==='resultado_desconhecido'?'recibo':'envio';
    if(!somenteLeitura&&(item.fase==='envio'||item.fase==='recibo'))item.estado='resultado_desconhecido';
    if(reabrirReleitura)item.releituraRetencaoVerificada=true;
    if(somenteConvergencia)item.reconciliacaoVerificadaEm=tempo;
    item.dono=dono;item.reserva=crypto.randomUUID();item.leaseAte=tempo+leaseMs;
    await requisicao(s.intencoes.put(item));return item;
   }
   return null;
  });
 }
 async function alterarReserva(item,fn){
  return transacao('readwrite',async s=>{
   const atual=await requisicao(s.intencoes.get([item.conta,item.id]));
   if(!atual||atual.reserva!==item.reserva||atual.dono!==item.dono||atual.leaseAte<=agora())throw erro('A reserva da intenção mudou; consulte o recibo antes de repetir.','RESERVA_EXPIRADA');
   await fn(atual,s);atual.atualizadoEm=agora();await requisicao(s.intencoes.put(atual));return atual;
  });
 }
 const soltar=item=>{delete item.dono;delete item.reserva;delete item.leaseAte;};
 const liberarReserva=item=>alterarReserva(item,soltar);
 const renovarReserva=(item,{leaseMs=60000}={})=>{
  if(leaseMs<1000)throw erro('Consumidor inválido.','CONSUMIDOR_INVALIDO');
  return transacao('readwrite',async s=>{
   const atual=await requisicao(s.intencoes.get([item.conta,item.id]));
   // Expiry alone does not transfer ownership. Renew only the same immutable
   // reservation token; a different consumer can never be renewed or released.
   if(!atual||atual.reserva!==item.reserva||atual.dono!==item.dono)throw erro('A reserva da intenção mudou; consulte o recibo antes de repetir.','RESERVA_EXPIRADA');
   atual.leaseAte=agora()+leaseMs;await requisicao(s.intencoes.put(atual));return atual;
  });
 };
 // Same injected clock as reservation/renewal, with no IndexedDB transaction.
 // An absent/retrograde observation or an unknown deadline never skips renewal.
 const observarPrazoReserva=(item,{leaseMs=60000,ultimoAgora=null}={})=>{
  const tempo=agora(),prazo=item?.leaseAte;
  return {agora:tempo,comFolga:Number.isFinite(tempo)&&Number.isFinite(prazo)&&Number.isFinite(ultimoAgora)&&
   tempo>=ultimoAgora&&tempo>=prazo-leaseMs&&prazo-tempo>leaseMs/3};
 };
 const registrarEnvio=item=>alterarReserva(item,atual=>{atual.tentativas++;atual.tentativasTotais=(atual.tentativasTotais||0)+1;atual.fase='envio';atual.estado='resultado_desconhecido';atual.enviadoEm=agora();});
 const registrarRecibo=(item,recibo)=>{
  if(!recibo||typeof recibo!=='object'||Array.isArray(recibo))throw erro('Recibo inválido.','RECIBO_INVALIDO');
  validarReciboOperacoes(recibo,item.payload,item.pedido);
  return alterarReserva(item,atual=>{atual.fase='releitura';atual.recibo=structuredClone(recibo);atual.estado='confirmado_aguardando_leitura';atual.confirmadoEm=agora();atual.proximaTentativa=0;});
 };
 const registrarAusenciaReciboReconciliacao=item=>alterarReserva(item,atual=>{
  if(atual.recibo||atual.estado!=='bloqueado_validacao'||atual.erro?.rejeicaoConfirmada!==false)
   throw erro('A pendência mudou durante a consulta.','REVISAO_NECESSARIA');
  atual.reciboReconciliacaoConsultado=true;soltar(atual);
 });
 const confirmarLeitura=item=>alterarReserva(item,atual=>{
  if(!atual.recibo)throw erro('A leitura não substitui o recibo de gravação.','RECIBO_AUSENTE');
  atual.estado='confirmado';atual.lidoEm=agora();soltar(atual);
 });
 const confirmarEstadoExistente=(item,prova)=>alterarReserva(item,atual=>{
  const metas=prova?.tipo==='metas_ja_presentes_no_servidor'&&elegivelReconciliacaoMetas(atual);
  const preferencias=prova?.tipo==='preferencias_ja_presentes_no_servidor'&&atual.estado==='bloqueado_conflito'&&atual.erro?.codigo==='PT409'&&escopoPreferencias(atual);
  if(!(metas||preferencias)||typeof atual.checksum!=='string'||prova.checksum!==atual.checksum)
   throw erro('A intenção mudou durante a reconciliação.','REVISAO_NECESSARIA');
  atual.estado=preferencias?'dispensado':'confirmado';atual.lidoEm=agora();atual.decisao={tipo:prova.tipo,em:atual.lidoEm};
  delete atual.erro;soltar(atual);
 });
 const dispensarCampoIdentico=(item,pronto)=>alterarReserva(item,async(atual,s)=>{
  const prova=provaCampoSemEscrita(atual,pronto);
  if(!prova)throw erro('A evidência do arquivo ou sua versão mudou.','REVISAO_NECESSARIA');
  const vivos=(await requisicao(s.intencoes.index('conta').getAll(item.conta))).filter(i=>i.id!==atual.id&&!['confirmado','substituido','dispensado'].includes(i.estado));
  const dependentes=vivos.filter(i=>dependenciasEfetivasDaIntencao(i).includes(atual.id)||i.original.unidade===atual.original.unidade);
  // A newer version of this same file supersedes this copy on the next pass,
  // so refusing here cannot deadlock. Any other dependent only waits on this
  // request: it sends nothing here, and its own compare-and-set still applies.
  if(dependentes.some(i=>arquivoUnicoDaIntencao(i)?.id===prova.id))
   throw erro('A cópia de Campo tem alterações dependentes; o histórico foi preservado.','CAMPO_COPIA_COM_DEPENDENTES');
  if(atual.leaseAte<=agora())throw erro('A reserva da intenção mudou durante a verificação.','RESERVA_EXPIRADA');
  atual.estado='dispensado';atual.decisao={tipo:'campo_ja_presente_no_servidor',em:agora(),prova};
  soltar(atual);
 });
 // Closes a single-file request with no server write and no receipt: either
 // preparation proved there is nothing to write, or a refused conflict's exact
 // content was read back from the server. Never marks it confirmed.
 const dispensarArquivoSemGravacao=(item,prova)=>alterarReserva(item,atual=>{
  const a=arquivoUnicoDaIntencao(atual),arquivo=a&&atual.original.intencao.arquivos[a.id];
  const comum=a&&prova?.id===a.id&&prova.version===a.version&&!atual.recibo;
  const semEfeito=comum&&prova.tipo==='arquivo_sem_gravacao_necessaria'&&nuncaEnviada(atual)&&
   (prova.motivo==='remocao_sem_registro'?arquivo.value===null:prova.motivo==='conteudo_identico'&&typeof arquivo.value==='string'&&prova.dados?.chave===a.key);
  const presente=comum&&prova.tipo==='arquivo_ja_presente_no_servidor'&&arquivoEmConflito(atual)&&canonico(prova.dados)===canonico(atual.payload[0].changes.dados);
  if(!semEfeito&&!presente)throw erro('A evidência do arquivo ou sua versão mudou.','REVISAO_NECESSARIA');
  if(atual.leaseAte<=agora())throw erro('A reserva da intenção mudou durante a verificação.','RESERVA_EXPIRADA');
  atual.estado='dispensado';atual.decisao={tipo:prova.tipo,em:agora(),prova:structuredClone(prova)};
  soltar(atual);
 });
 // Closes a never-sent request without files whose fresh preparation proved
 // there is nothing to write: every edited value is already what the server
 // returns. No receipt exists, so it is dispensed, never marked confirmed.
 const dispensarJaPresente=(item,prova)=>alterarReserva(item,atual=>{
  if(prova?.tipo!=='ja_presente_no_servidor'||typeof atual.checksum!=='string'||prova.checksum!==atual.checksum||!semArquivos(atual)||atual.original?.preparar!==true||!nuncaEnviada(atual))
   throw erro('A intenção mudou durante a verificação.','REVISAO_NECESSARIA');
  if(atual.leaseAte<=agora())throw erro('A reserva da intenção mudou durante a verificação.','RESERVA_EXPIRADA');
  atual.estado='dispensado';atual.decisao={tipo:prova.tipo,em:agora()};
  delete atual.erro;soltar(atual);
 });
 const registrarFalha=(item,e,{fase=item.fase}={})=>alterarReserva(item,atual=>{
  const falha=classificarFalha(e),{status,codigo,categoria}=falha,anterior=atual.erro;
  // C1 `sessao`: not a property of this request. State, phase, counters and
  // schedule stay as they were; the error is informative and the pass aborts.
  if(categoria==='sessao'){atual.erro={...falha,rejeicaoConfirmada:false,fase,informativo:true};
   // A short pause only: a path that cannot invalidate the session must not spin.
   if(!(atual.proximaTentativa>agora()+PAUSA_SESSAO_MS))atual.proximaTentativa=agora()+PAUSA_SESSAO_MS;
   soltar(atual);return;}
  const rejeicaoConfirmada=['preparacao','envio'].includes(fase)&&([400,403,404,409,422].includes(status)||codigo==='PT409');
  // Only statuses received from the server prove rejection. A lost response does not.
  if(atual.recibo)atual.estado='confirmado_aguardando_leitura';
  else if(rejeicaoConfirmada&&categoria==='conflito')atual.estado='bloqueado_conflito';
  else if(['permissao','validacao','registro_indisponivel'].includes(categoria)||rejeicaoConfirmada)atual.estado='bloqueado_validacao';
  // 429 proves "not processed" only for the write itself; a throttled receipt
  // lookup leaves the result unknown, so the lookup is repeated before any resend.
  else atual.estado=status===429&&fase==='envio'?'falha_transitoria':'resultado_desconhecido';
  atual.fase=fase;atual.erro={...falha,rejeicaoConfirmada,fase};
  // A conflict found with the current rules is not prepared again by the
  // once-per-version repair; only conflicts recorded by older rules are.
  if(atual.estado==='bloqueado_conflito'&&fase==='preparacao')atual.conflitoRegrasVersao=VERSAO_REGRAS_CONFIRMACAO;
  atual.falhas=(atual.falhas||0)+1;atual.falhouEm=agora();
  // The server answered the write itself with the same 5xx error repeatedly: a
  // deterministic failure (not a timeout/overload) needs review, not endless resends.
  const mesma=categoria==='transitoria'&&fase==='envio'&&erroServidorDeterministico(status,codigo);
  const continua=mesma&&anterior?.fase==='envio'&&anterior.status===status&&anterior.codigo===codigo&&atual.repeticoesEnvio>0;
  atual.repeticoesEnvio=continua?atual.repeticoesEnvio+1:mesma?1:0;
  if(!continua)atual.repeticoesDesde=mesma?agora():null;
  // Backoff grows with consecutive failures, also before anything was sent.
  atual.proximaTentativa=agora()+atrasoRetentativa(atual.falhas,e?.retryAfterMs,aleatorio);
  // Review is reserved for server verdicts. Transient failures are retried with
  // backoff indefinitely (never MAX_SAFE_INTEGER); an unknown result remains
  // unknown and is resolved through the request lookup before any resend.
  // Other non-review categories (read-back, storage, unproven conflict) keep
  // the previous bounded automatic attempts.
  if(['permissao','validacao','registro_indisponivel'].includes(categoria)||categoria!=='transitoria'&&(atual.tentativas>=5||atual.falhas>=5))atual.proximaTentativa=Number.MAX_SAFE_INTEGER;
  // Review without a proven refusal: the same request can still be resumed by
  // the user (with the receipt lookup first); automatic resumption skips it.
  if(atual.repeticoesEnvio>=LIMITE_ERRO_SERVIDOR_REPETIDO&&agora()-atual.repeticoesDesde>=JANELA_ERRO_SERVIDOR_REPETIDO_MS&&!atual.recibo){atual.estado='bloqueado_validacao';atual.erro={...atual.erro,categoria:'validacao',rejeicaoConfirmada:false,repetida:true};atual.proximaTentativa=Number.MAX_SAFE_INTEGER;}
  soltar(atual);
 });
 const fixarPayload=(item,payload,preparado)=>alterarReserva(item,atual=>{
  if(atual.payload)throw erro('Payload já fixado.','PAYLOAD_IMUTAVEL');
  if(!Array.isArray(payload)||!payload.length)throw erro('Esta intenção não gerou operações de gravação verificáveis. O original foi preservado para revisão.','INTENCAO_SEM_OPERACOES');
  atual.payload=structuredClone(payload);atual.preparado=structuredClone(preparado);atual.estado='resultado_desconhecido';
 });
 async function rearmarCadastro(conta,auditoriaId){
  contaValida(conta);
  return transacao('readwrite',async s=>{
   const items=await requisicao(s.intencoes.index('conta').getAll(conta)),tempo=agora();
   const candidatos=items.filter(i=>podeRearmarCadastro(i,auditoriaId,tempo));
   if(candidatos.length!==1)return false;
   // All original bytes, receipt state, identifier and retry counters remain.
   // The normal lease/receipt/dependency checks still govern this next pass.
   const [item]=candidatos;item.proximaTentativa=0;item.atualizadoEm=tempo;
   await requisicao(s.intencoes.put(item));return true;
  });
 }
 // One extra automatic attempt only after a real reconnection; preserve counters,
 // immutable IDs and the normal dependency, session and compare-and-set guards.
 async function reabrirPreparacoesAoReconectar(conta){
  contaValida(conta);
  return transacao('readwrite',async s=>{
   const tempo=agora(),items=await requisicao(s.intencoes.index('conta').getAll(conta));
   let total=0;
   for(const i of items)if(podeVerificarPreparacaoAoReconectar(i,tempo)){
    i.proximaTentativa=0;i.verificadaAoReconectar=true;i.atualizadoEm=tempo;
    await requisicao(s.intencoes.put(i));total++;
   }
   return total;
  });
 }
 // Reopen exhausted temporary read-backs once, without changing the receipt,
 // payload, attempts or dependencies. The processor revalidates this old receipt
 // with the current account before it can confirm any row or file.
 async function reabrirReleiturasTemporarias(conta){
  contaValida(conta);
  return transacao('readwrite',async s=>{
   const tempo=agora(),items=await requisicao(s.intencoes.index('conta').getAll(conta));let total=0;
   for(const i of items)if(podeRetomarLeituraAutomaticamente(i,tempo)){
    i.proximaTentativa=0;
    // Versioned marker: one fresh comparison per comparison-rules version.
    if(i.erro.codigo==='LEITURA_DIVERGENTE')marcarReleituraDivergente(i);
    else i.releituraTemporariaVerificada=true;
    i.atualizadoEm=tempo;
    await requisicao(s.intencoes.put(i));total++;
   }
   return total;
  });
 }
 // C5: make transient/session items eligible now (online, focus, valid session,
 // periodic tick). Counters, ids, payloads, receipts and phases are preserved;
 // review states, active leases and proven refusals are never touched.
 async function retomarTransitorias(conta){
  contaValida(conta);await migrarConta(conta);
  return transacao('readwrite',async s=>{
   const tempo=agora();let total=0;
   for(const i of await requisicao(s.intencoes.index('conta').getAll(conta))){
    if(!(i.proximaTentativa>tempo)||!retomavelTransitoria(i,tempo))continue;
    // Floor: a signal may shorten the wait, never below PISO_RETOMADA_MS after the
    // last real failure; event storms cannot turn the backoff into a hot loop.
    const piso=i.erro?.categoria==='sessao'?tempo:Math.max(tempo,(i.falhouEm||0)+PISO_RETOMADA_MS);
    if(piso>=i.proximaTentativa)continue;
    i.estado=estadoRetomado(i);i.proximaTentativa=piso;i.atualizadoEm=tempo;
    await requisicao(s.intencoes.put(i));total++;
   }
   return total;
  });
 }
 async function retomar(conta,id){
  contaValida(conta);return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id]));
   if(!item)throw erro('Item não está disponível nesta conta. Atualize a lista de pendências.','REVISAO_NECESSARIA');
   // A stale preview is not a new write. Keep terminal entries and active leases
   // intact, including their receipts, retry counters and original payloads.
   if(['confirmado','substituido','dispensado'].includes(item.estado))return item;
   if(!['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura'].includes(item.estado)&&!(['bloqueado_validacao','bloqueado_conflito'].includes(item.estado)&&!revisaoDeRecusa(item)))throw erro('A pendência mudou. Abra novamente a prévia antes de retomar.','REVISAO_NECESSARIA');
   if(item.leaseAte>agora())return item;
   item.proximaTentativa=0;item.tentativas=0;item.falhas=0;item.repeticoesEnvio=0;item.repeticoesDesde=null;item.estado=item.recibo?'confirmado_aguardando_leitura':item.payload?'resultado_desconhecido':'pendente_local';
   await requisicao(s.intencoes.put(item));return item;
  });
 }
 async function substituir(conta,id,novoId){
  contaValida(conta);return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id])),novo=await requisicao(s.intencoes.get([conta,novoId]));
   if(!item||!novo||item.leaseAte>agora()||!revisaoDeRecusa(item)||novo.estado!=='pendente_local')throw erro('Revisão mudou; atualize a prévia.','REVISAO_NECESSARIA');
   // The replacement must not wait on the item it supersedes.
   novo.dependencias=dependenciasEfetivasDaIntencao(item);
   if(novo.escopoArquivos?.versao===1)novo.escopoArquivos={...novo.escopoArquivos,dependencias:[...novo.dependencias]};
   novo.ordem=item.ordem;item.estado='substituido';item.substituidaPor=novoId;
   await requisicao(s.intencoes.put(novo));await requisicao(s.intencoes.put(item));return novo;
  });
 }
 async function aceitarLeituraAtual(conta,id,{arquivosAtual={}}={}){
  contaValida(conta);
  return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id]));
   if(!item?.recibo||item.estado!=='confirmado_aguardando_leitura'||item.leaseAte>agora())throw erro('Confirmação ainda não disponível para revisão.','REVISAO_NECESSARIA');
   item.estado='confirmado';item.decisao={tipo:'aceitar_estado_atual_apos_recibo',em:agora(),arquivosAtual:structuredClone(arquivosAtual)};await requisicao(s.intencoes.put(item));return item;
  });
 }
 async function aceitarRemoto(conta,id){
  return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id]));
   if(!item||item.recibo||!revisaoDeRecusa(item)||item.leaseAte>agora())throw erro('Somente uma tentativa recusada pode ser dispensada.','REVISAO_NECESSARIA');
   item.estado='dispensado';item.decisao={tipo:'manter_remoto',em:agora()};await requisicao(s.intencoes.put(item));return item;
  });
 }
 async function preservarLegado(conta,texto){
  contaValida(conta);if(typeof texto!=='string')throw erro('Rascunho original inválido.','LEGADO_INVALIDO');
  const checksum=await checksumIntencao(texto);
  return transacao('readwrite',async s=>{
   const antigo=await requisicao(s.originais.get([conta,checksum]));if(antigo)return antigo;
   // Raw original retained verbatim, including malformed JSON, for explicit recovery.
   const original={conta,checksum,protocoloOrigem:1,texto,preservadoEm:agora(),estado:'aguardando_classificacao'};
   await requisicao(s.originais.add(original));return original;
  });
 }
 async function classificarLegadoSemEfeito(conta,checksum,pedido){
  contaValida(conta);return transacao('readwrite',async s=>{
   const original=await requisicao(s.originais.get([conta,checksum]));
   if(!original||await requisicao(s.intencoes.get([conta,pedido])))throw erro('A identidade antiga já precisa de revisão. Original preservado.','REVISAO_NECESSARIA');
   if(original.estado!=='sem_operacoes_de_negocio'){
    original.estado='sem_operacoes_de_negocio';original.classificacao={tipo:'tentativa_vazia_sem_arquivos_ou_edicoes',pedido,em:agora()};
    await requisicao(s.originais.put(original));
   }
   return original;
  });
 }
 async function exportar(conta){
  contaValida(conta);return transacao('readonly',async s=>({protocolo:PROTOCOLO,conta,intencoes:await requisicao(s.intencoes.index('conta').getAll(conta)),originais:await requisicao(s.originais.index('conta').getAll(conta))}));
 }
 return {enfileirar,listar,reservar,liberarReserva,renovarReserva,observarPrazoReserva,nomeTrava:item=>JSON.stringify(['integracao-intencao-v2',nome,item.conta,item.id]),fixarPayload,retomar,retomarTransitorias,rearmarCadastro,registrarAusenciaReciboReconciliacao,reabrirPreparacoesAoReconectar,reabrirReleiturasTemporarias,substituir,aceitarRemoto,aceitarLeituraAtual,registrarEnvio,registrarRecibo,confirmarLeitura,confirmarEstadoExistente,dispensarCampoIdentico,dispensarArquivoSemGravacao,dispensarJaPresente,registrarFalha,preservarLegado,classificarLegadoSemEfeito,exportar,async fechar(){if(conexao)(await conexao).close();conexao=null;migradas=new Set();}};
}

// Web Locks outlive timer throttling while a tab is waiting on an upload/read.
// The IDB lease still owns every mutation and permits recovery after a crash.
// Without Web Locks the existing lease protocol remains available, with renewal;
// strict exclusion during suspended tabs requires a supporting browser.
async function consumirReserva(fila,opcoes,reserva,executar){
 const {conta,dono,sessaoAtual,leaseMs=60000,renovarCadaMs=20000,travas=globalThis.navigator?.locks}=opcoes;
 const ignorarIds=[...(opcoes.ignorarIds||[])];
 const conferir=()=>{if(!sessaoAtual())throw erro('Sessão encerrada. A intenção permanece na conta original.','SESSAO_ALTERADA');};
 // C2: never reserve or prepare while the session is invalid or absent
 // (`estadoSessao(): 'valida'|'renovando'|'invalida'|'ausente'`, optional).
 const sessaoUtilizavel=()=>typeof opcoes.estadoSessao!=='function'||['valida','renovando'].includes(opcoes.estadoSessao());
 for(;;){
  conferir();if(!sessaoUtilizavel())return null;const item=await fila.reservar(conta,{dono,leaseMs,...reserva,ignorarIds});if(!item)return null;
  const rodar=async(comWebLock=false)=>{
   let falhaRenovacao,corrente=Promise.resolve(),prazoConhecido=item;
   let ultimoAgora=Number.isFinite(item.leaseAte)?item.leaseAte-leaseMs:null;
   const verificar=()=>{conferir();if(falhaRenovacao)throw falhaRenovacao;};
   const renovar=({forcar=false}={})=>{
    corrente=corrente.then(async()=>{
     verificar();
     // Only the actual exclusive Web Lock protects this short fast path.
     // All durable mutations still validate owner/token/expiry transactionally.
     if(!forcar&&comWebLock&&fila.observarPrazoReserva){
      const observacao=fila.observarPrazoReserva(prazoConhecido,{leaseMs,ultimoAgora});
      ultimoAgora=Number.isFinite(observacao.agora)?observacao.agora:null;
      if(observacao.comFolga)return;
     }
     const atual=await fila.renovarReserva?.(item,{leaseMs});
     const conhecido=atual?.reserva===item.reserva&&atual?.dono===item.dono&&Number.isFinite(atual?.leaseAte);
     prazoConhecido=conhecido?atual:null;ultimoAgora=conhecido?atual.leaseAte-leaseMs:null;
    });
    corrente.catch(e=>{falhaRenovacao=e;});return corrente;
   };
   const passo=async fn=>{verificar();await renovar();verificar();const result=await fn();verificar();await renovar();verificar();return result;};
   const timer=setInterval(()=>{renovar({forcar:true}).catch(()=>{});},Math.max(50,Math.min(renovarCadaMs,leaseMs/3)));
   try{return await executar(item,{conferir:verificar,passo});}
   finally{clearInterval(timer);await corrente.catch(()=>{});}
  };
  if(!travas?.request)return rodar();
  let obtida=false;
  const nome=fila.nomeTrava?.(item)||JSON.stringify(['integracao-intencao-v2',conta,item.id]);
  const result=await travas.request(nome,{ifAvailable:true},lock=>{
   if(!lock)return null;obtida=true;
   return rodar(travas===globalThis.navigator?.locks&&lock.name===nome&&lock.mode==='exclusive');
  });
  if(obtida)return result;
  // Contention is neither an attempted write nor a failure. Skip this item in
  // this pass and allow an independently ready request to use the consumer.
  try{await fila.liberarReserva(item);}catch(e){if(e.code!=='RESERVA_EXPIRADA')throw e;}
  ignorarIds.push(item.id);if(reserva.somenteId)return null;
 }
}

// The application must capture session identity in these callbacks. This processor
// never obtains a token itself, and never infers a business unit from table names.
export async function processarIntencao(fila,opcoes){
 const {consultarRecibo,enviar,reler,preparar,provarEstado,validarEnvio,somenteId=null,aoReservar=()=>{}}=opcoes;
 return consumirReserva(fila,opcoes,{somenteId},async(reservado,{conferir,passo})=>{
 let item=reservado,fase=item.fase;
 try{
  aoReservar(item.id);
  conferir();
  if(!item.payload){
   fase='preparacao';const pronto=await passo(()=>preparar(item));conferir();
   if(pronto.provaEstado){
    const prontoItem=await fila.confirmarEstadoExistente(item,pronto.provaEstado);
    conferir();pronto.aposConfirmar?.();return prontoItem;
   }
   if(provaCampoSemEscrita(item,pronto))return await fila.dispensarCampoIdentico(item,pronto);
   const semGravacao=provaArquivoSemGravacao(item,pronto);
   if(semGravacao){
    const dispensado=await fila.dispensarArquivoSemGravacao(item,{tipo:'arquivo_sem_gravacao_necessaria',...semGravacao});
    conferir();await pronto.aposDispensar?.();return dispensado;
   }
   if(Object.values(pronto.identicos||{}).some(p=>!p?.motivo)&&!pronto.operacoes.length)
    throw erro('Não foi possível encerrar a cópia sem mudar a intenção original.','CAMPO_COPIA_LEITURA_INCONCLUSIVA');
   if(pronto.jaPresente&&Array.isArray(pronto.operacoes)&&!pronto.operacoes.length&&fila.dispensarJaPresente)return await fila.dispensarJaPresente(item,pronto.jaPresente);
   if(!Array.isArray(pronto.operacoes)||!pronto.operacoes.length)throw erro('Esta intenção não gerou operações de gravação verificáveis. O original foi preservado para revisão.','INTENCAO_SEM_OPERACOES');
   item=await fila.fixarPayload(item,pronto.operacoes,pronto);conferir();
  }
  // Empty historical payloads cannot acquire a synthetic receipt from the
  // no-op write adapter. Only the proven local/Campo paths above may dispense
  // an intention without a server write; they never mark it confirmed.
  if(!Array.isArray(item.payload)||!item.payload.length)throw erro('Esta intenção não gerou operações de gravação verificáveis. O original foi preservado para revisão.','INTENCAO_SEM_OPERACOES');
  if(!item.recibo){
   let recibo;
   if(item.fase==='recibo'){
    fase='recibo';recibo=await passo(()=>consultarRecibo(item));conferir();
    // The receipt RPC returns JSON null only after an authorized lookup proves
    // absence. An inconclusive/empty transport result is never permission to send.
    if(recibo!==null&&(!recibo||typeof recibo!=='object'||Array.isArray(recibo)))throw erro('A consulta do recibo não foi concluída. O pedido original permanece preservado.','RECIBO_INCONCLUSIVO');
   }
   if(recibo===null&&provarEstado&&elegivelReconciliacaoMetas(item)){
    const resultado=await passo(()=>provarEstado(item));conferir();
    if(resultado){
     const prontoItem=await fila.confirmarEstadoExistente(item,resultado.prova);
     conferir();resultado.aposConfirmar?.();return prontoItem;
    }
   }
   if(!recibo){
    if(validarEnvio){fase='preparacao';await passo(()=>validarEnvio(item));conferir();}
    fase='envio';item=await fila.registrarEnvio(item);conferir();recibo=await passo(()=>enviar(item));conferir();
   }
   item=await fila.registrarRecibo(item,recibo);conferir();
  }else{
   // A receipt already present in local storage (including imported queues)
   // is not proof of its author. Revalidate the same request/payload through
   // the caller-token RPC before an automatic read-back can close it. A receipt
   // received from this pass's send or lookup needs no additional request.
   fase='recibo';const verificado=await passo(()=>consultarRecibo(item));conferir();
   if(!verificado||canonico(verificado)!==canonico(item.recibo))throw erro('O recibo antigo ainda não pôde ser verificado nesta conta. O original permanece preservado.','RECIBO_INCONCLUSIVO');
  }
  fase='releitura';await passo(()=>reler(item));conferir();return await fila.confirmarLeitura(item);
 }catch(e){
  // A session change leaves the lease to expire; no callbacks for the new account.
  if(e.code==='SESSAO_ALTERADA')throw e;
  try{await fila.registrarFalha(item,e,{fase});}catch(falha){if(falha.code!=='RESERVA_EXPIRADA')throw falha;}
  throw e;
 }
 });
}

// Support reads share the same account, lease and dependency checks. This path
// has no preparation/upload/send callback and cannot turn a rejection into a
// new automatic write. Missing receipts preserve the previous blocked state.
export async function lerIntencaoExistente(fila,opcoes){
 const {id,consultarRecibo,reler,modo}=opcoes;
 if(!['consulta','releitura'].includes(modo))throw erro('Ação indisponível.','REVISAO_NECESSARIA');
 return consumirReserva(fila,opcoes,{somenteId:id,somenteLeitura:true,exigirRecibo:modo==='releitura'},async(reservado,{conferir,passo})=>{
 let item=reservado;
 try{
  conferir();
  if(modo==='releitura'&&(!Array.isArray(item.payload)||!item.payload.length))throw erro('Esta intenção não gerou operações de gravação verificáveis. O original foi preservado para revisão.','INTENCAO_SEM_OPERACOES');
  if(!item.recibo){
   const recibo=await passo(()=>consultarRecibo(item));conferir();
   if(recibo!==null&&(!recibo||typeof recibo!=='object'||Array.isArray(recibo)))throw erro('A consulta do recibo não foi concluída. O pedido original permanece preservado.','RECIBO_INCONCLUSIVO');
   if(recibo)item=await fila.registrarRecibo(item,recibo);
  }
  else if(modo==='releitura'){
   const verificado=await passo(()=>consultarRecibo(item));conferir();
   if(!verificado||canonico(verificado)!==canonico(item.recibo))throw erro('O recibo antigo ainda não pôde ser verificado nesta conta. O original permanece preservado.','RECIBO_INCONCLUSIVO');
  }
  if(item.recibo&&modo==='releitura'){await passo(()=>reler(item));conferir();return await fila.confirmarLeitura(item);}
  conferir();return await fila.liberarReserva(item);
 }catch(e){
  if(e.code==='SESSAO_ALTERADA')throw e;
  try{
   if(item.recibo&&modo==='releitura')await fila.registrarFalha(item,e,{fase:'releitura'});
   else await fila.liberarReserva(item);
  }catch(falha){if(falha.code!=='RESERVA_EXPIRADA')throw falha;}
  throw e;
 }
 });
}

// A blocked conflict is never returned to the write worker. Only prove the
// existing state under its original lease; a mismatch retains the old error.
export async function reconciliarIntencaoMetas(fila,opcoes){
 return consumirReserva(fila,opcoes,{somenteLeitura:true,somenteConvergencia:true},async(item,{conferir,passo})=>{
  try{
   opcoes.aoReservar?.(item.id);
   if(item.estado==='bloqueado_validacao'&&opcoes.consultarRecibo&&opcoes.reler){
    const recibo=await passo(()=>opcoes.consultarRecibo(item));conferir();
    if(recibo===null){await fila.registrarAusenciaReciboReconciliacao(item);return false;}
    const gravado=await fila.registrarRecibo(item,recibo);conferir();
    try{
     await passo(()=>opcoes.reler(gravado));conferir();
     return await fila.confirmarLeitura(gravado);
    }catch(e){
     if(e.code==='SESSAO_ALTERADA')throw e;
     await fila.registrarFalha(gravado,e,{fase:'releitura'});
     // Transition to an authenticated receipt is material even if its read
     // diverged; notify other tabs without calling the write worker.
     return gravado;
    }
   }
   const resultado=await passo(()=>opcoes.provar(item));conferir();
   if(resultado){
    const prontoItem=resultado.prova?.tipo==='arquivo_ja_presente_no_servidor'?await fila.dispensarArquivoSemGravacao(item,resultado.prova):await fila.confirmarEstadoExistente(item,resultado.prova);
    conferir();await resultado.aposConfirmar?.();return prontoItem;
   }
  }catch(e){if(e.code==='SESSAO_ALTERADA')throw e;}
  try{await fila.liberarReserva(item);}catch(e){if(e.code!=='RESERVA_EXPIRADA')throw e;}
  return false;
 });
}
