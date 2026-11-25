import {elegivelRetomadaCrm} from './retomada-remota-validacao.js';
import {motivoEspera} from './estado-sincronizacao.js';
import {elegivelReconciliacaoMetas,conflitoReconciliavelMetas} from './reconciliacao-metas.js';
import {escopoArquivosDaIntencao,recursosEfetivosDaIntencao,dependenciasEfetivasDaIntencao,provaCampoSemEscrita,arquivoUnicoDaIntencao,provaArquivoSemGravacao,arquivoEmConflito,conflitoArquivoReconciliavel} from './arquivos-intencoes.js';
import {classificarFalha,revisaoDeRecusa,podeRearmarCadastro,podeVerificarPreparacaoAoReconectar,podeRetomarLeituraAutomaticamente,atrasoRetentativa,retomavelTransitoria,estadoRetomado,erroServidorDeterministico,marcarReleituraDivergente,podeReprepararConflito,marcarConflitoRepreparado,VERSAO_REGRAS_CONFIRMACAO} from './estado-sincronizacao.js';
// Bounds for resumed/session items and for a repeated deterministic server error.
const PISO_RETOMADA_MS=15000,PAUSA_SESSAO_MS=5000,LIMITE_ERRO_SERVIDOR_REPETIDO=5,JANELA_ERRO_SERVIDOR_REPETIDO_MS=600000;
import {remapearIdentidades} from './aliases-tipados.js';
import {VERSAO_CLIENTE} from './diagnostico-sincronizacao.js';
import {validarReciboOperacoes} from './recibo-operacoes.js';
import {estruturaReleituraNotificacoesLegadas} from './confirmacao-mutacoes.js';
import {pendenciaSomenteLocal} from './intencoes-locais.js';
import {edicaoDerivada} from './projecoes-derivadas.js';

// Protocol 2 has its own database. Legacy clients cannot write its entries.
// An entry is one explicitly defined atomic business operation, never one table.
const PROTOCOLO=2;
const erro=(message,code)=>Object.assign(new Error(message),{code});
const requisicao=p=>new Promise((resolve,reject)=>{p.onsuccess=()=>resolve(p.result);p.onerror=()=>reject(p.error);});
function canonico(v){
 if(v===undefined)return 'undefined';
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonico).join(',')+']';
 if(v&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonico(v[k])).join(',')+'}';
 throw erro('A intenção contém um valor não serializável.','INTENCAO_INVALIDA');
}
export async function checksumIntencao(v){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof v==='string'?v:canonico(v)));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function abrirFilaIntencoes({indexedDB=globalThis.indexedDB,nome='integracao-intencoes-v2',agora=()=>Date.now(),aleatorio=Math.random}={}){
 let conexao,migradas=new Set();
 const abrir=()=>{
  if(!indexedDB)throw erro('O armazenamento persistente não está disponível. Exporte as alterações antes de sair.','PERSISTENCIA_INDISPONIVEL');
  if(!conexao)conexao=new Promise((resolve,reject)=>{
   const p=indexedDB.open(nome,1);let encerrado=false;
   p.onupgradeneeded=()=>{
    const db=p.result,items=db.createObjectStore('intencoes',{keyPath:['conta','id']});items.createIndex('conta','conta');
    const originais=db.createObjectStore('originais',{keyPath:['conta','checksum']});originais.createIndex('conta','conta');
    db.createObjectStore('sequencias',{keyPath:'conta'});
   };
   p.onerror=()=>reject(p.error);
   p.onblocked=()=>{encerrado=true;reject(erro('Outra aba está impedindo a abertura da fila. Preserve as alterações e tente novamente.','FILA_BLOQUEADA'));};
   p.onsuccess=()=>{if(encerrado){p.result.close();return;}p.result.onversionchange=()=>{p.result.close();conexao=null;migradas=new Set();};resolve(p.result);};
  }).catch(e=>{conexao=null;throw e;});
  return conexao;
 };
 async function transacao(modo,fn){
  const db=await abrir();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['intencoes','originais','sequencias'],modo),lojas=Object.fromEntries(['intencoes','originais','sequencias'].map(k=>[k,tx.objectStore(k)]));
   let resultado,falha;
   tx.oncomplete=()=>resolve(resultado);
   tx.onabort=()=>reject(falha||tx.error||erro('A gravação local foi cancelada. As alterações ainda não estão guardadas.','PERSISTENCIA_ABORTADA'));
   tx.onerror=()=>{};
   Promise.resolve().then(()=>fn(lojas,tx)).then(r=>{resultado=r;},e=>{falha=e;try{tx.abort();}catch{reject(e);}});
  });
 }
 const contaValida=conta=>{if(typeof conta!=='string'||!conta)throw erro('Conta da intenção ausente.','CONTA_INVALIDA');};
 // C1 migration, once per account per connection and idempotent: old clients
 // parked transient/session failures at MAX_SAFE_INTEGER. Without a proven
 // server refusal they become eligible now, keeping id, payload, receipt and
 // phase; sent entries still go through the request lookup before any resend.
 async function migrarConta(conta){
  if(migradas.has(conta))return;
  // A failed migration never blocks reading; the next operation retries it.
  await transacao('readwrite',async s=>{
   const tempo=agora(),todas=await requisicao(s.intencoes.index('conta').getAll(conta));
   for(const i of todas){
    // One new preparation for a never-sent file request parked as "no
    // operations": it can now be closed with proof, or it parks again.
    if(i.estado==='bloqueado_validacao'&&i.erro?.codigo==='INTENCAO_SEM_OPERACOES'&&!i.semOperacoesVerificada&&!(i.leaseAte>tempo)&&arquivoUnicoDaIntencao(i)&&nuncaEnviada(i)){
     i.estado='pendente_local';i.proximaTentativa=tempo;i.semOperacoesVerificada=true;
     await requisicao(s.intencoes.put(i));continue;
    }
    // Same single re-evaluation for a never-sent request without files: an
    // access/presence-only entry is dispensed, a value already on the server is
    // closed with proof by the preparation, anything else parks again.
    if(i.estado==='bloqueado_validacao'&&i.erro?.codigo==='INTENCAO_SEM_OPERACOES'&&!i.semOperacoesVerificada&&!(i.leaseAte>tempo)&&semArquivos(i)&&i.original?.preparar===true&&nuncaEnviada(i)){
     i.estado='pendente_local';i.proximaTentativa=tempo;i.semOperacoesVerificada=true;
     await requisicao(s.intencoes.put(i));continue;
    }
    // A conflict found before any send is prepared once more per comparison-rules
    // version (the merge rules may now reconcile it). If it persists it is
    // recorded again as bloqueado_conflito, with the marker, and stays in review.
    if(podeReprepararConflito(i,tempo)){
     marcarConflitoRepreparado(i);i.proximaTentativa=tempo;i.atualizadoEm=tempo;
     await requisicao(s.intencoes.put(i));continue;
    }
    if(i.proximaTentativa!==Number.MAX_SAFE_INTEGER||!retomavelTransitoria(i,tempo))continue;
    i.estado=estadoRetomado(i);i.proximaTentativa=tempo;i.retentativaMigradaEm=tempo;
    await requisicao(s.intencoes.put(i));
   }
   await coalescerArquivos(s,todas,tempo);
  }).then(()=>migradas.add(conta),()=>{});
 }
 const semArquivos=i=>Object.keys(i.original?.intencao?.arquivos||{}).length===0;
 const nuncaEnviada=i=>i.payload==null&&i.preparado==null&&i.recibo==null&&i.enviadoEm==null&&i.confirmadoEm==null&&!(i.tentativas>0)&&!(i.tentativasTotais>0);
 // A whole-value file has one meaningful local version: the newest. Older
 // file-only versions that never reached the server (or were provably refused)
 // are archived as superseded, with their bytes kept in the journal, so one
 // refused or pending version cannot hold every later one. Requests with an
 // unknown result, a receipt, an active lease or an explicit review decision
 // are never touched. Idempotent; runs inside the caller's transaction.
 async function coalescerArquivos(s,items,tempo=agora()){
  const grupos=new Map();
  for(const i of items){
   if(['confirmado','substituido','dispensado'].includes(i.estado))continue;
   const a=arquivoUnicoDaIntencao(i);if(!a)continue;
   const chave=JSON.stringify([a.id,a.key]);grupos.set(chave,[...(grupos.get(chave)||[]),i]);
  }
  let total=0;
  for(const grupo of grupos.values()){
   grupo.sort((a,b)=>a.ordem-b.ordem);const ultima=grupo.at(-1);
   if(grupo.length<2||ultima.leaseAte>tempo)continue;
   // A live request outside the group that sits between a version and the
   // survivor and waits on that version (or shares the file) would end up
   // waiting on the survivor while the survivor waits on it. Keep such a
   // version, and every earlier one, in the ordinary chain.
   const recurso='arquivo:'+arquivoUnicoDaIntencao(ultima).id,membros=new Set(grupo.map(i=>i.id));
   const vivos=items.filter(x=>!membros.has(x.id)&&!['confirmado','substituido','dispensado'].includes(x.estado));
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
    if(item.leaseAte>tempo||!elegivel||somenteConvergencia&&!conflitoReconciliavelMetas(item,tempo)&&!conflitoArquivoReconciliavel(item,tempo)||somenteLeitura&&!somenteConvergencia&&(!item.payload||exigirRecibo&&!item.recibo))continue;
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
 const confirmarLeitura=item=>alterarReserva(item,atual=>{
  if(!atual.recibo)throw erro('A leitura não substitui o recibo de gravação.','RECIBO_AUSENTE');
  atual.estado='confirmado';atual.lidoEm=agora();soltar(atual);
 });
 const confirmarEstadoExistente=(item,prova)=>alterarReserva(item,atual=>{
  if(!elegivelReconciliacaoMetas(atual)||typeof atual.checksum!=='string'||prova?.tipo!=='metas_ja_presentes_no_servidor'||prova.checksum!==atual.checksum)
   throw erro('A intenção mudou durante a reconciliação.','REVISAO_NECESSARIA');
  atual.estado='confirmado';atual.lidoEm=agora();atual.decisao={tipo:prova.tipo,em:atual.lidoEm};
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
 return {enfileirar,listar,reservar,liberarReserva,renovarReserva,observarPrazoReserva,nomeTrava:item=>JSON.stringify(['integracao-intencao-v2',nome,item.conta,item.id]),fixarPayload,retomar,retomarTransitorias,rearmarCadastro,reabrirPreparacoesAoReconectar,reabrirReleiturasTemporarias,substituir,aceitarRemoto,aceitarLeituraAtual,registrarEnvio,registrarRecibo,confirmarLeitura,confirmarEstadoExistente,dispensarCampoIdentico,dispensarArquivoSemGravacao,dispensarJaPresente,registrarFalha,preservarLegado,classificarLegadoSemEfeito,exportar,async fechar(){if(conexao)(await conexao).close();conexao=null;migradas=new Set();}};
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
