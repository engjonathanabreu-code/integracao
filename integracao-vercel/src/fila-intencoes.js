import {elegivelReconciliacaoMetas,conflitoReconciliavelMetas} from './reconciliacao-metas.js';
import {escopoArquivosDaIntencao,recursosEfetivosDaIntencao,dependenciasEfetivasDaIntencao,provaCampoSemEscrita} from './arquivos-intencoes.js';
import {classificarFalha,revisaoDeRecusa,podeRearmarCadastro,podeVerificarPreparacaoAoReconectar,podeRetomarReleitura,ciclosBackoffIntencao} from './estado-sincronizacao.js';
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
 let conexao;
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
   p.onsuccess=()=>{if(encerrado){p.result.close();return;}p.result.onversionchange=()=>{p.result.close();conexao=null;};resolve(p.result);};
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
 async function listar(conta){contaValida(conta);return transacao('readonly',async s=>(await requisicao(s.intencoes.index('conta').getAll(conta))).sort((a,b)=>a.ordem-b.ordem));}
 // Freeze safe scopes even when their own real dependencies are still blocked.
 // Otherwise an already persisted file-only successor can never reach selection.
 async function congelarEscopos(s,items,tempo=agora()){
  for(const item of items.sort((a,b)=>a.ordem-b.ordem)){
   if(item.escopoArquivos||item.leaseAte>tempo)continue;
   const escopo=escopoArquivosDaIntencao(item,items);
   if(escopo){item.escopoArquivos=escopo;await requisicao(s.intencoes.put(item));}
  }
 }
 async function enfileirar({conta,id=crypto.randomUUID(),unidade,modulo,dependencias=[],operacoes,base,intencao,preparar=false,recursos=[unidade],referencias=[],criadas=[],legado=null,substituirId=null}){
  contaValida(conta);
  if(!unidade||!modulo||!Array.isArray(operacoes)||(!operacoes.length&&!preparar)||dependencias.includes(id))throw erro('Unidade, módulo ou operações inválidos.','INTENCAO_INVALIDA');
  // Copy before the first await; callers may keep editing their objects.
  const original=structuredClone({protocolo:PROTOCOLO,unidade,modulo,dependencias:[...new Set(dependencias)],operacoes,base,intencao,preparar,recursos,referencias,criadas});
  if(substituirId)original.substitui=substituirId;
  canonico(original);
  const checksum=await checksumIntencao(original);
  return transacao('readwrite',async s=>{
   const existente=await requisicao(s.intencoes.get([conta,id]));
   if(existente){if(existente.checksum!==checksum)throw erro('A mesma intenção foi reutilizada com outro conteúdo.','PEDIDO_DIVERGENTE');return existente;}
   const substituida=substituirId?await requisicao(s.intencoes.get([conta,substituirId])):null;
   if(substituirId&&(!substituida||substituirId===id||substituida.recibo||substituida.leaseAte>agora()||!revisaoDeRecusa(substituida)))throw erro('Revisão mudou; atualize a prévia.','REVISAO_NECESSARIA');
   for(const dep of original.dependencias)if(!await requisicao(s.intencoes.get([conta,dep])))throw erro('Dependência indisponível nesta conta.','DEPENDENCIA_INDISPONIVEL');
   const anteriores=await requisicao(s.intencoes.index('conta').getAll(conta));
   // Persist proven pre-send scopes before capturing successor resources. The
   // removed attachment must not reappear if its unrelated data edit later fails.
   await congelarEscopos(s,anteriores);
   // Append order and dependency capture share the same transaction across tabs.
   const deps=anteriores.filter(x=>!['confirmado','substituido','dispensado'].includes(x.estado)&&(x.original.unidade===unidade||recursosEfetivosDaIntencao(x).some(r=>recursos.includes(r))||x.original.criadas?.some(r=>referencias.includes(r)))).map(x=>x.id);
   const seq=await requisicao(s.sequencias.get(conta));
   const item={conta,id,pedido:id,checksum,original,ordem:(seq?.valor||0)+1,estado:'pendente_local',clienteVersao:VERSAO_CLIENTE,tentativas:0,tentativasTotais:0,criadoEm:agora(),atualizadoEm:agora(),proximaTentativa:0,dependencias:[...new Set([...original.dependencias,...deps])]};
   if(substituida){
    item.dependencias=dependenciasEfetivasDaIntencao(substituida);item.ordem=substituida.ordem;
    substituida.estado='substituido';substituida.substituidaPor=id;
    await requisicao(s.intencoes.put(substituida));
   }
   if(legado){item.payload=structuredClone(operacoes);item.preparado={antes:legado.before,depois:legado.after,sent:legado.sent||{}};item.estado=legado.confirmacao?'confirmado_aguardando_leitura':legado.rejeitada?'bloqueado_validacao':'resultado_desconhecido';if(legado.confirmacao)item.recibo=structuredClone(legado.confirmacao);}
   await requisicao(s.sequencias.put({conta,valor:(seq?.valor||0)+1}));await requisicao(s.intencoes.add(item));return item;
  });
 }
 async function reservar(conta,{dono,leaseMs=60000,somenteId=null,somenteLeitura=false,exigirRecibo=false,somenteConvergencia=false,ignorarIds=[]}={}){
  contaValida(conta);if(!dono||leaseMs<1000)throw erro('Consumidor inválido.','CONSUMIDOR_INVALIDO');
  return transacao('readwrite',async s=>{
   const items=(await requisicao(s.intencoes.index('conta').getAll(conta))).sort((a,b)=>a.ordem-b.ordem),tempo=agora();
   for(const item of items)if(!somenteLeitura&&(!somenteId||item.id===somenteId)&&!(item.leaseAte>tempo)&&pendenciaSomenteLocal(item)){
    item.estado='dispensado';item.decisao={tipo:item.original.intencao.edicoes.some(edicaoDerivada)?'somente_projecao_derivada_local':'somente_presenca_ou_acesso_local',em:tempo};
    await requisicao(s.intencoes.put(item));
   }
   if(!somenteLeitura)await congelarEscopos(s,items,tempo);
   for(const item of items){
    if(somenteId&&item.id!==somenteId)continue;
    if(ignorarIds.includes(item.id))continue;
    const elegivel=['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura'].includes(item.estado)||somenteLeitura&&['bloqueado_validacao','bloqueado_conflito'].includes(item.estado);
    if(item.leaseAte>tempo||!elegivel||somenteConvergencia&&!conflitoReconciliavelMetas(item,tempo)||somenteLeitura&&!somenteConvergencia&&(!item.payload||exigirRecibo&&!item.recibo))continue;
    // One read-only retry after this repair, even when the old code exhausted
    // its attempts. The marker is committed together with the existing lease.
    const reabrirReleitura=!somenteLeitura&&!somenteId&&item.proximaTentativa===Number.MAX_SAFE_INTEGER&&
     item.estado==='confirmado_aguardando_leitura'&&item.erro?.codigo==='LEITURA_DIVERGENTE'&&
     !item.releituraRetencaoVerificada&&estruturaReleituraNotificacoesLegadas(item,conta);
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
  if(vivos.some(i=>dependenciasEfetivasDaIntencao(i).includes(atual.id)||i.original.unidade===atual.original.unidade))
   throw erro('A cópia de Campo tem alterações dependentes; o histórico foi preservado.','CAMPO_COPIA_COM_DEPENDENTES');
  if(atual.leaseAte<=agora())throw erro('A reserva da intenção mudou durante a verificação.','RESERVA_EXPIRADA');
  atual.estado='dispensado';atual.decisao={tipo:'campo_ja_presente_no_servidor',em:agora(),prova};
  soltar(atual);
 });
 const registrarFalha=(item,e,{fase=item.fase}={})=>alterarReserva(item,atual=>{
  const falha=classificarFalha(e),{status,codigo,categoria}=falha;
  const rejeicaoConfirmada=['preparacao','envio'].includes(fase)&&([400,401,403,404,409,422].includes(status)||codigo==='PT409');
  // Only statuses received from the server prove rejection. A lost response does not.
  if(atual.recibo)atual.estado='confirmado_aguardando_leitura';
  else if(rejeicaoConfirmada&&categoria==='conflito')atual.estado='bloqueado_conflito';
  else if(['sessao','permissao','validacao'].includes(categoria)||rejeicaoConfirmada)atual.estado='bloqueado_validacao';
  else atual.estado=status===429?'falha_transitoria':'resultado_desconhecido';
  atual.fase=fase;atual.erro={...falha,rejeicaoConfirmada,fase};
  atual.falhas=(atual.falhas||0)+1;
  const retry=Number(e.retryAfterMs)||0;
  const ciclos=ciclosBackoffIntencao(atual);
  atual.proximaTentativa=agora()+Math.max(retry,Math.min(60000,1000*2**Math.min(ciclos,6))*(.5+aleatorio()*.5));
  // Automatic retries are bounded. An unknown result remains unknown after exhaustion.
  if(['sessao','permissao','validacao'].includes(categoria)||atual.tentativas>=5||atual.falhas>=5)atual.proximaTentativa=Number.MAX_SAFE_INTEGER;
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
   for(const i of items)if(podeRetomarReleitura(i,tempo)){
    i.proximaTentativa=0;i.releituraTemporariaVerificada=true;i.atualizadoEm=tempo;
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
   item.proximaTentativa=0;item.tentativas=0;item.falhas=0;item.estado=item.recibo?'confirmado_aguardando_leitura':item.payload?'resultado_desconhecido':'pendente_local';
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
 return {enfileirar,listar,reservar,liberarReserva,renovarReserva,observarPrazoReserva,nomeTrava:item=>JSON.stringify(['integracao-intencao-v2',nome,item.conta,item.id]),fixarPayload,retomar,rearmarCadastro,reabrirPreparacoesAoReconectar,reabrirReleiturasTemporarias,substituir,aceitarRemoto,aceitarLeituraAtual,registrarEnvio,registrarRecibo,confirmarLeitura,confirmarEstadoExistente,dispensarCampoIdentico,registrarFalha,preservarLegado,classificarLegadoSemEfeito,exportar,async fechar(){if(conexao)(await conexao).close();conexao=null;}};
}

// Web Locks outlive timer throttling while a tab is waiting on an upload/read.
// The IDB lease still owns every mutation and permits recovery after a crash.
// Without Web Locks the existing lease protocol remains available, with renewal;
// strict exclusion during suspended tabs requires a supporting browser.
async function consumirReserva(fila,opcoes,reserva,executar){
 const {conta,dono,sessaoAtual,leaseMs=60000,renovarCadaMs=20000,travas=globalThis.navigator?.locks}=opcoes;
 const ignorarIds=[...(opcoes.ignorarIds||[])];
 const conferir=()=>{if(!sessaoAtual())throw erro('Sessão encerrada. A intenção permanece na conta original.','SESSAO_ALTERADA');};
 for(;;){
  conferir();const item=await fila.reservar(conta,{dono,leaseMs,...reserva,ignorarIds});if(!item)return null;
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
 const {consultarRecibo,enviar,reler,preparar,provarEstado,somenteId=null,aoReservar=()=>{}}=opcoes;
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
   if(Object.keys(pronto.identicos||{}).length&&!pronto.operacoes.length)
    throw erro('Não foi possível encerrar a cópia sem mudar a intenção original.','CAMPO_COPIA_LEITURA_INCONCLUSIVA');
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
   if(!recibo){fase='envio';item=await fila.registrarEnvio(item);conferir();recibo=await passo(()=>enviar(item));conferir();}
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
    const prontoItem=await fila.confirmarEstadoExistente(item,resultado.prova);
    conferir();resultado.aposConfirmar?.();return prontoItem;
   }
  }catch(e){if(e.code==='SESSAO_ALTERADA')throw e;}
  try{await fila.liberarReserva(item);}catch(e){if(e.code!=='RESERVA_EXPIRADA')throw e;}
  return false;
 });
}
