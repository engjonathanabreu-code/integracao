import {remapearIdentidades} from './aliases-tipados.js';
import {pendenciaSomenteLocal} from './intencoes-locais.js';

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
   if(substituirId&&(!substituida||substituirId===id||substituida.recibo||substituida.leaseAte>agora()||!['bloqueado_conflito','bloqueado_validacao'].includes(substituida.estado)))throw erro('Revisão mudou; atualize a prévia.','REVISAO_NECESSARIA');
   for(const dep of original.dependencias)if(!await requisicao(s.intencoes.get([conta,dep])))throw erro('Dependência indisponível nesta conta.','DEPENDENCIA_INDISPONIVEL');
   const anteriores=await requisicao(s.intencoes.index('conta').getAll(conta));
   // Append order and dependency capture share the same transaction across tabs.
   const deps=anteriores.filter(x=>!['confirmado','substituido','dispensado'].includes(x.estado)&&(x.original.recursos?.some(r=>recursos.includes(r))||x.original.criadas?.some(r=>referencias.includes(r)))).map(x=>x.id);
   const seq=await requisicao(s.sequencias.get(conta));
   const item={conta,id,pedido:id,checksum,original,ordem:(seq?.valor||0)+1,estado:'pendente_local',tentativas:0,criadoEm:agora(),proximaTentativa:0,dependencias:[...new Set([...original.dependencias,...deps])]};
   if(substituida){
    item.dependencias=[...(substituida.dependencias||[])];item.ordem=substituida.ordem;
    substituida.estado='substituido';substituida.substituidaPor=id;
    await requisicao(s.intencoes.put(substituida));
   }
   if(legado){item.payload=structuredClone(operacoes);item.preparado={antes:legado.before,depois:legado.after,sent:legado.sent||{}};item.estado=legado.confirmacao?'confirmado_aguardando_leitura':legado.rejeitada?'bloqueado_validacao':'resultado_desconhecido';if(legado.confirmacao)item.recibo=structuredClone(legado.confirmacao);}
   await requisicao(s.sequencias.put({conta,valor:(seq?.valor||0)+1}));await requisicao(s.intencoes.add(item));return item;
  });
 }
 async function reservar(conta,{dono,leaseMs=60000}={}){
  contaValida(conta);if(!dono||leaseMs<1000)throw erro('Consumidor inválido.','CONSUMIDOR_INVALIDO');
  return transacao('readwrite',async s=>{
   const items=(await requisicao(s.intencoes.index('conta').getAll(conta))).sort((a,b)=>a.ordem-b.ordem),tempo=agora();
   for(const item of items)if(!(item.leaseAte>tempo)&&pendenciaSomenteLocal(item)){
    item.estado='dispensado';item.decisao={tipo:'somente_presenca_ou_acesso_local',em:tempo};
    await requisicao(s.intencoes.put(item));
   }
   for(const item of items){
    if(!['pendente_local','resultado_desconhecido','falha_transitoria','confirmado_aguardando_leitura'].includes(item.estado)||item.proximaTentativa>tempo||item.leaseAte>tempo)continue;
    if(items.some(antes=>antes.ordem<item.ordem&&antes.original.unidade===item.original.unidade&&!['confirmado','substituido','dispensado'].includes(antes.estado)))continue;
    const resolver=id=>{let d=items.find(i=>i.id===id);const vistos=new Set();while(d?.substituidaPor&&!vistos.has(d.id)){vistos.add(d.id);d=items.find(i=>i.id===d.substituidaPor);}return d;};
    const deps=(item.dependencias||item.original.dependencias).map(resolver);
    if(deps.some(d=>!d||!['confirmado','dispensado'].includes(d.estado)))continue;
    if(!item.payload&&!item.original.preparar){
     const aliases=Object.assign({},...deps.map(d=>d.recibo?.aliases||{}));
     item.payload=remapearIdentidades(item.original.operacoes,aliases);
    }
    item.fase=!item.payload?'preparacao':item.estado==='confirmado_aguardando_leitura'?'releitura':item.estado==='resultado_desconhecido'?'recibo':'envio';
    if(item.fase==='envio'||item.fase==='recibo')item.estado='resultado_desconhecido';
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
   fn(atual);await requisicao(s.intencoes.put(atual));return atual;
  });
 }
 const soltar=item=>{delete item.dono;delete item.reserva;delete item.leaseAte;};
 const registrarEnvio=item=>alterarReserva(item,atual=>{atual.tentativas++;atual.estado='resultado_desconhecido';atual.enviadoEm=agora();});
 const registrarRecibo=(item,recibo)=>{
  if(!recibo||typeof recibo!=='object'||Array.isArray(recibo))throw erro('Recibo inválido.','RECIBO_INVALIDO');
  return alterarReserva(item,atual=>{atual.recibo=structuredClone(recibo);atual.estado='confirmado_aguardando_leitura';atual.confirmadoEm=agora();atual.proximaTentativa=0;});
 };
 const confirmarLeitura=item=>alterarReserva(item,atual=>{
  if(!atual.recibo)throw erro('A leitura não substitui o recibo de gravação.','RECIBO_AUSENTE');
  atual.estado='confirmado';atual.lidoEm=agora();soltar(atual);
 });
 const registrarFalha=(item,e)=>alterarReserva(item,atual=>{
  const status=Number(e.status||e.cause?.status),codigo=e.code||e.cause?.code||'TRANSPORTE';
  // Only statuses received from the server prove rejection. A lost response does not.
  if(atual.recibo)atual.estado='confirmado_aguardando_leitura';
  else if(status===409||codigo==='PT409')atual.estado='bloqueado_conflito';
  else if([400,401,403,404,422].includes(status))atual.estado='bloqueado_validacao';
  else atual.estado=status===429?'falha_transitoria':'resultado_desconhecido';
  atual.erro={status:Number.isFinite(status)?status:null,codigo:String(codigo).slice(0,60)};
  atual.falhas=(atual.falhas||0)+1;
  const retry=Number(e.retryAfterMs)||0;
  atual.proximaTentativa=agora()+Math.max(retry,Math.min(60000,1000*2**Math.min(atual.tentativas,6))*(.5+aleatorio()*.5));
  // Automatic retries are bounded. An unknown result remains unknown after exhaustion.
  if(atual.tentativas>=5||atual.falhas>=5)atual.proximaTentativa=Number.MAX_SAFE_INTEGER;
  soltar(atual);
 });
 const fixarPayload=(item,payload,preparado)=>alterarReserva(item,atual=>{
  if(atual.payload)throw erro('Payload já fixado.','PAYLOAD_IMUTAVEL');
  atual.payload=structuredClone(payload);atual.preparado=structuredClone(preparado);atual.estado='resultado_desconhecido';
 });
 async function retomar(conta,id){
  contaValida(conta);return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id]));
   if(!item||item.leaseAte>agora()||['confirmado','substituido','dispensado'].includes(item.estado))throw erro('Item não está disponível para retomada.','REVISAO_NECESSARIA');
   item.proximaTentativa=0;item.tentativas=0;item.falhas=0;item.estado=item.recibo?'confirmado_aguardando_leitura':item.payload?'resultado_desconhecido':'pendente_local';
   await requisicao(s.intencoes.put(item));return item;
  });
 }
 async function substituir(conta,id,novoId){
  contaValida(conta);return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id])),novo=await requisicao(s.intencoes.get([conta,novoId]));
   if(!item||!novo||item.leaseAte>agora()||!['bloqueado_conflito','bloqueado_validacao'].includes(item.estado)||novo.estado!=='pendente_local')throw erro('Revisão mudou; atualize a prévia.','REVISAO_NECESSARIA');
   // The replacement must not wait on the item it supersedes.
   novo.dependencias=[...(item.dependencias||[])];novo.ordem=item.ordem;item.estado='substituido';item.substituidaPor=novoId;
   await requisicao(s.intencoes.put(novo));await requisicao(s.intencoes.put(item));return novo;
  });
 }
 async function aceitarLeituraAtual(conta,id){
  return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id]));
   if(!item?.recibo||item.estado!=='confirmado_aguardando_leitura'||item.leaseAte>agora())throw erro('Confirmação ainda não disponível para revisão.','REVISAO_NECESSARIA');
   item.estado='confirmado';item.decisao={tipo:'aceitar_estado_atual_apos_recibo',em:agora()};await requisicao(s.intencoes.put(item));return item;
  });
 }
 async function aceitarRemoto(conta,id){
  return transacao('readwrite',async s=>{
   const item=await requisicao(s.intencoes.get([conta,id]));
   if(!item||!['bloqueado_conflito','bloqueado_validacao'].includes(item.estado)||item.leaseAte>agora())throw erro('Somente uma tentativa recusada pode ser dispensada.','REVISAO_NECESSARIA');
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
 async function exportar(conta){
  contaValida(conta);return transacao('readonly',async s=>({protocolo:PROTOCOLO,conta,intencoes:await requisicao(s.intencoes.index('conta').getAll(conta)),originais:await requisicao(s.originais.index('conta').getAll(conta))}));
 }
 return {enfileirar,listar,reservar,fixarPayload,retomar,substituir,aceitarRemoto,aceitarLeituraAtual,registrarEnvio,registrarRecibo,confirmarLeitura,registrarFalha,preservarLegado,exportar,async fechar(){if(conexao)(await conexao).close();conexao=null;}};
}

// The application must capture session identity in these callbacks. This processor
// never obtains a token itself, and never infers a business unit from table names.
export async function processarIntencao(fila,{conta,dono,sessaoAtual,consultarRecibo,enviar,reler,preparar}){
 const conferir=()=>{if(!sessaoAtual())throw erro('Sessão encerrada. A intenção permanece na conta original.','SESSAO_ALTERADA');};
 conferir();let item=await fila.reservar(conta,{dono});if(!item)return null;
 try{
  conferir();
  if(!item.payload){const pronto=await preparar(item);conferir();item=await fila.fixarPayload(item,pronto.operacoes,pronto);conferir();}
  if(!item.recibo){
   let recibo;
   if(item.fase==='recibo'){recibo=await consultarRecibo(item);conferir();}
   if(!recibo){item=await fila.registrarEnvio(item);conferir();recibo=await enviar(item);conferir();}
   item=await fila.registrarRecibo(item,recibo);conferir();
  }
  await reler(item);conferir();return await fila.confirmarLeitura(item);
 }catch(e){
  // A session change leaves the lease to expire; no callbacks for the new account.
  if(e.code==='SESSAO_ALTERADA')throw e;
  try{await fila.registrarFalha(item,e);}catch(falha){if(falha.code!=='RESERVA_EXPIRADA')throw falha;}
  throw e;
 }
}
