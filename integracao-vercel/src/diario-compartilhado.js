import {ajustarComparacaoFinanceira} from './contrato-financeiro.js';
import {revisaoDeRecusa} from './estado-sincronizacao.js';
import {edicaoDerivada,preservarDerivadasFixadas} from './projecoes-derivadas.js';
import {abrirFilaIntencoes,processarIntencao,lerIntencaoExistente,checksumIntencao} from './fila-intencoes.js';
import {extrairIntencao,recursosIntencao,aplicarIntencao,semearOriginais,recortarIntencao} from './intencoes-edicao.js';
import {referenciasIdentidades,remapearIdentidades} from './aliases-tipados.js';
import {igualSemantico} from './igualdade-semantica.js';
import {edicaoSomenteLocal} from './intencoes-locais.js';
import {arquivosDaIntencao} from './arquivos-intencoes.js';
import {revisarLeitura,snapshotLeitura} from './revisao-leitura.js';
const terminal=i=>['confirmado','substituido','dispensado'].includes(i.estado);
const uuidHash=h=>`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
export function criarDiarioCompartilhado({conta,ativo,carregar,preparar,enviar,consultarRecibo,confirmar,aceitarLeitura=async()=>{},atualizou,notificar=()=>{},fila=abrirFilaIntencoes()}){
 const canal=typeof BroadcastChannel==='function'?new BroadcastChannel('integracao-diario-v2:'+conta):null;
 if(canal)canal.onmessage=()=>{if(ativo())notificar();};
 const sinalizar=()=>canal?.postMessage({protocolo:2});
 const dono=crypto.randomUUID();let corrente=Promise.resolve(),capturas=Promise.resolve(),items=[],revisao=null;const volateis=new Map(),avisos=[];
 const conferir=()=>{if(!ativo())throw Object.assign(Error('Sessão encerrada.'),{code:'SESSAO_ALTERADA'});};
 const atualizar=async()=>{const novos=await fila.listar(conta);conferir();items=novos;atualizou([...items,...avisos,...[...volateis.values()].map(p=>({id:p.id,original:{modulo:p.modulo,intencao:p.intencao},estado:'persistencia_falhou',tentativas:0}))]);return items;};
 const aliases=()=>Object.assign({},...items.filter(i=>i.recibo).map(i=>i.recibo.aliases||{}));
 function materializar(remoto){
  let db=structuredClone(remoto);
  const aplicar=edicoes=>{
   const r=aplicarIntencao(db,edicoes,{aliases:aliases()});
   // A pending draft is not evidence that a competing value was saved. Keep
   // compatible local fields visible, but use the current server value for
   // conflicting leaves; every original remains available in the review.
   db=r.conflitos.length?aplicarIntencao(db,edicoes,{aliases:aliases(),escolhas:Object.fromEntries(r.conflitos.map(c=>[c.chave,'remoto']))}).dados:r.dados;
  };
  for(const item of items.filter(i=>!terminal(i))){
   if(item.recibo&&item.erro?.codigo==='LEITURA_DIVERGENTE')continue;
   aplicar(item.original.intencao.edicoes||[]);
  }
  for(const p of volateis.values())aplicar(p.intencao.edicoes);
  return db;
 }
 function adicionar(antes,depois,arquivos={},opcoes={}){
  const edicoes=extrairIntencao(antes,depois),id=opcoes.id||crypto.randomUUID();
  if(!edicoes.length&&!Object.keys(arquivos).length&&!opcoes.legado)return Promise.resolve(null);
  const recursos=[...recursosIntencao(edicoes),...Object.keys(arquivos).map(k=>'arquivo:'+k)];
  const payload={conta,id,unidade:recursos[0]||'auditoria:'+id,recursos,modulo:edicoes.find(e=>e.colecao!=='auditoria')?.colecao||'arquivos',dependencias:opcoes.dependencias||[],referencias:referenciasIdentidades(edicoes),criadas:edicoes.filter(e=>e.id&&!e.antes.existe).map(e=>e.id),operacoes:opcoes.legado?.operations||[],preparar:!opcoes.legado,base:{},intencao:{edicoes,arquivos},legado:opcoes.legado||null};
  if(opcoes.substituirId)payload.substituirId=opcoes.substituirId;
  volateis.set(id,payload);
  // Serialization stays local to this controller; the database also orders other tabs.
  const trabalho=corrente.catch(()=>{}).then(async()=>{let item;try{item=await fila.enfileirar(payload);}catch(e){if(opcoes.substituirId&&e.code==='REVISAO_NECESSARIA')volateis.delete(id);throw e;}volateis.delete(id);sinalizar();if(ativo())await atualizar();return item;});corrente=trabalho;return trabalho;
 }
 function adicionarArquivos(db,arquivos){
  const snapshot=structuredClone(arquivos),dados=structuredClone(db);
  const trabalho=capturas.catch(()=>{}).then(async()=>{
   await corrente.catch(()=>{});conferir();await atualizar();
   for(const [id,arquivo] of Object.entries(snapshot)){
    const existe=[...items.map(i=>arquivosDaIntencao(i,items)),...[...volateis.values()].map(p=>p.intencao.arquivos)].some(a=>a?.[id]?.version&&a[id].version===arquivo.version);
    if(!existe)await adicionar(dados,dados,{[id]:arquivo});
   }
  });capturas=trabalho;return trabalho;
 }
 async function importarLegado(texto){
  if(!texto)return;await fila.preservarLegado(conta,texto);conferir();
  let draft;try{draft=JSON.parse(texto);}catch{throw Error('O rascunho antigo foi preservado, mas precisa de revisão por estar ilegível.');}
  if(!draft.pending&&!draft.attempt)return;
  if(!draft.baseline||!draft.db)throw Error('Rascunho antigo preservado sem base original; exporte para revisão seletiva.');
  const hash=await checksumIntencao(texto);conferir();
  const importar=async(antes,depois,arquivos,opcoes)=>{
   const existente=(await fila.listar(conta)).find(i=>i.id===opcoes.id);conferir();
   if(existente){
    const o=existente.original;
    const a=opcoes.legado;
    const compativel=a?o.preparar===false&&igualSemantico(o.operacoes,a.operations)&&igualSemantico(existente.preparado?.antes,a.before)&&igualSemantico(existente.preparado?.depois,a.after)&&igualSemantico(existente.preparado?.sent||{},a.sent||{}):o.preparar===true&&igualSemantico((o.intencao.edicoes||[]).filter(e=>!edicaoSomenteLocal(e)&&!edicaoDerivada(e)),extrairIntencao(antes,depois))&&igualSemantico(o.intencao.arquivos||{},arquivos);
    if(!compativel)throw Error('A identidade do rascunho já possui outro conteúdo. Original preservado para revisão.');
    return existente;
   }
   return adicionar(antes,depois,arquivos,opcoes);
  };
  if(draft.attempt){
   const a=draft.attempt;if(!a.id||!a.before||!a.after||!Array.isArray(a.operations))throw Error('Tentativa antiga incompleta; original preservado para revisão.');
   if(!a.operations.length){
    // Preserve the raw original; classify only proven absence of business effects.
    // Do not manufacture a volatile, unsendable files intention for presence.
    if(a.confirmacao||Object.keys(a.sent||{}).length||extrairIntencao(a.before,a.after).length)throw Error('Tentativa antiga sem operações válidas. Original preservado para revisão.');
    await fila.classificarLegadoSemEfeito(conta,hash,a.id);conferir();
    await importar(a.after,draft.db,{}, {id:uuidHash(hash)});conferir();await atualizar();return;
   }
   await importar(a.before,a.after,a.sent||{},{id:a.id,legado:a});conferir();
   await importar(a.after,draft.db,{}, {id:uuidHash(hash),dependencias:[a.id]});
  }else await importar(draft.baseline,draft.db,{}, {id:uuidHash(hash)});
  conferir();await atualizar();
 }
 async function migrar(texto){
  try{return await importarLegado(texto);}catch(e){
   if(e.code==='SESSAO_ALTERADA'||e.name==='QuotaExceededError'||e.code?.startsWith('PERSISTENCIA'))throw e;
   if(!texto)throw e;
   // Keep malformed/incomplete originals quarantined; never import a whole snapshot.
   const original=await fila.preservarLegado(conta,texto);conferir();
   avisos.push({id:'legado:'+original.checksum,estado:'legado_revisao',original:{modulo:'Rascunho antigo',intencao:{edicoes:[]}},motivo:'O original precisa de revisão antes de ser convertido. Baixe a cópia preservada.',tentativas:0});
   await atualizar();
  }
 }
 async function lerItem(item){
  conferir();const edicoes=remapearIdentidades(item.original.intencao.edicoes||[],aliases()).filter(e=>preservarDerivadasFixadas(item)||!edicaoDerivada(e));
  const remoto=await carregar(edicoes);conferir();return {remoto,edicoes};
 }
 async function prepararItem(item){
  const {remoto,edicoes}=await lerItem(item),r=aplicarIntencao(remoto.db,ajustarComparacaoFinanceira(edicoes,remoto));
  if(r.conflitos.length)throw Object.assign(Error('Há valores diferentes no servidor. Revise esta alteração.'),{code:'PT409',status:409});
  const pronto=await preparar(remoto,r.dados,arquivosDaIntencao(item,items));conferir();return {...pronto,antes:recortarIntencao(remoto.db,edicoes),depois:recortarIntencao(r.dados,edicoes)};
 }
 async function executar({id=null,validar=async()=>{},verificar=()=>{}}={}){
  await capturas.catch(()=>{});await corrente.catch(()=>{});conferir();await atualizar();
  // Bound each pass; a later pass resumes independently ready entries.
  const limite=id?1:items.filter(i=>!terminal(i)).length;
  for(let n=0;n<limite;n++){
   conferir();let resultado;
   try{resultado=await processarIntencao(fila,{conta,dono,somenteId:id,sessaoAtual:()=>{verificar();return ativo();},preparar:async item=>{await validar();verificar();return prepararItem(item);},consultarRecibo:async item=>{await validar();verificar();return consultarRecibo(item);},enviar:async item=>{await validar();verificar();return enviar(item.payload,item.pedido,item.preparado.depois);},reler:async item=>{
    await validar();verificar();
    const {remoto}=await lerItem(item);conferir();await confirmar(item,remoto);conferir();
   }});}catch(e){if(e.code==='SESSAO_ALTERADA')throw e;resultado=true;}
   await atualizar();if(!resultado)break;sinalizar();
  }
  return items;
 }
 async function consultarExistente(id,{modo='consulta',validar=async()=>{},verificar=()=>{}}={}){
  await capturas.catch(()=>{});await corrente.catch(()=>{});conferir();verificar();await atualizar();
  try{return await lerIntencaoExistente(fila,{conta,dono,id,modo,sessaoAtual:()=>{verificar();return ativo();},consultarRecibo:async item=>{await validar();verificar();return consultarRecibo(item);},reler:async item=>{
   await validar();verificar();const {remoto}=await lerItem(item);conferir();verificar();await confirmar(item,remoto);conferir();verificar();
  }});}finally{if(ativo()){await atualizar();sinalizar();}}
 }
 async function previa(id){
  await corrente.catch(()=>{});if(avisos.some(a=>a.id===id)){const a=avisos.find(a=>a.id===id);return {id,item:a,conflitos:[],edicoes:[],dados:{},somenteExportar:true};}if(volateis.has(id)){const p=volateis.get(id);await fila.enfileirar(p);volateis.delete(id);}await atualizar();const item=items.find(i=>i.id===id);if(!item)throw Object.assign(Error('Item não está disponível nesta conta. Atualize a lista de pendências.'),{code:'REVISAO_NECESSARIA'});if(terminal(item)){if(revisao?.id===id)revisao=null;return null;}
  const {remoto,edicoes}=await lerItem(item);
  // Fixed payloads retain their original review, including the explicit option
  // to recognize current values after a receipt. Never rewrite a sent request.
  const r=aplicarIntencao(remoto.db,edicoes,{preservarDerivadas:preservarDerivadasFixadas(item)});
  const leitura=await revisarLeitura(item,remoto);conferir();
  revisao={id,item,remoto:remoto.db,edicoes,conflitos:r.conflitos,leitura,snapshot:snapshotLeitura(item,remoto,edicoes)};return {...revisao,dados:r.dados};
 }
 async function reconhecerLeitura(id){
  if(!revisao||revisao.id!==id||!revisao.item.recibo)throw Error('Abra a prévia de uma gravação com recibo antes de reconhecer os valores atuais.');
  const mostrada=revisao;await atualizar();
  const atual=items.find(i=>i.id===id);
  if(!atual||atual.estado!=='confirmado_aguardando_leitura'||!igualSemantico(atual.recibo,mostrada.item.recibo))throw Object.assign(Error('A pendência mudou. Abra novamente a prévia.'),{code:'REVISAO_NECESSARIA'});
  const {remoto,edicoes}=await lerItem(atual),snapshot=snapshotLeitura(atual,remoto,edicoes);
  if(!igualSemantico(snapshot,mostrada.snapshot))throw Error('Os dados ou arquivos mudaram. Abra novamente a prévia e confira os valores.');
  // This is an explicit local decision after a durable receipt, never a new
  // write and never automatic proof that the original value is still current.
  // Archive first. If cache persistence fails, the original file remains queued
  // and can be reconciled on reload from this durable, auditable decision.
  await fila.aceitarLeituraAtual(conta,id,{arquivosAtual:snapshot.arquivos});conferir();
  await aceitarLeitura(atual,remoto);conferir();
  if(revisao===mostrada)revisao=null;sinalizar();await atualizar();
 }
 async function resolver(id,escolhas){
  if(!revisao||revisao.id!==id)throw Error('Abra a prévia da pendência antes de confirmar.');
  const mostrada=revisao;
  // Background processing may have finished while this preview remained open.
  // A blocked decision still requires its original checks, never an implicit
  // acceptance of another tab's resolution.
  const retentativa=!revisaoDeRecusa(mostrada.item);
  const encerrarConcluida=async()=>{
   await atualizar();const atual=items.find(i=>i.id===id);
   if(atual&&terminal(atual)){if(revisao===mostrada)revisao=null;return true;}
   return false;
  };
  if(retentativa&&await encerrarConcluida())return;
  if(retentativa&&mostrada.item.estado.startsWith('bloqueado')&&!mostrada.item.recibo){
   await fila.retomar(conta,id);if(revisao===mostrada)revisao=null;await atualizar();return;
  }
  const {remoto}=await lerItem(mostrada.item);
  // The same send can complete while the remote read is in flight. Its own
  // confirmed value must not look like a new conflict in this stale preview.
  if(retentativa&&await encerrarConcluida())return;
  if(!igualSemantico(recortarIntencao(remoto.db,mostrada.edicoes,{preservarDerivadas:preservarDerivadasFixadas(mostrada.item)}),recortarIntencao(mostrada.remoto,mostrada.edicoes,{preservarDerivadas:preservarDerivadasFixadas(mostrada.item)})))throw Error('Os dados mudaram. Abra novamente a prévia e confira os valores.');
  if(mostrada.item.recibo&&!Object.keys(escolhas).length){await fila.retomar(conta,id);if(revisao===mostrada)revisao=null;await atualizar();return;}
  const r=aplicarIntencao(remoto.db,mostrada.edicoes,{escolhas,preservarDerivadas:preservarDerivadasFixadas(mostrada.item)});if(r.conflitos.length)throw Error('Escolha todos os valores em conflito.');
  if(mostrada.item.recibo&&mostrada.conflitos.length){
   if(!igualSemantico(r.dados,remoto.db))throw Error('Esta gravação já tem recibo. Reconheça o valor atual compartilhado e depois abra o registro para fazer uma nova edição.');
   return reconhecerLeitura(id);
  }
  if(!revisaoDeRecusa(mostrada.item)){
   // Unknown writes and receipts are never replaced with a new request.
   await fila.retomar(conta,id);if(revisao===mostrada)revisao=null;await atualizar();return;
  }
  let edicoes=extrairIntencao(remoto.db,r.dados);
  const arquivos=arquivosDaIntencao(mostrada.item,items);
  // Explicitly accepting the server still leaves an auditable no-op replacement.
  if(!edicoes.length&&!Object.keys(arquivos).length){await fila.aceitarRemoto(conta,id);revisao=null;await atualizar();return;}
  await adicionar(remoto.db,r.dados,arquivos,{substituirId:id});revisao=null;await atualizar();
 }
 async function descartar(id){
  if(!revisao||revisao.id!==id||!revisaoDeRecusa(revisao.item))throw Error('Abra a prévia de uma tentativa recusada antes de descartá-la.');
  const item=revisao.item,{remoto}=await lerItem(item),arquivos=arquivosDaIntencao(item,items);
  conferir();await fila.aceitarRemoto(conta,id);conferir();
  await aceitarLeitura({...item,preparado:{...item.preparado,sent:arquivos}},remoto);conferir();
  revisao=null;sinalizar();await atualizar();
 }
 async function retomarAutomaticas({id=null}={}){
  await corrente.catch(()=>{});conferir();await atualizar();
  for(const item of items)if((!id||item.id===id)&&!terminal(item)&&!item.estado.startsWith('bloqueado')&&item.proximaTentativa===Number.MAX_SAFE_INTEGER){await fila.retomar(conta,item.id);conferir();}
  await atualizar();
 }
 async function exportar(){
  await capturas.catch(()=>{});
  const emCurso=structuredClone([...volateis.values()]);
  const salvo=await fila.exportar(conta),ids=new Set(salvo.intencoes.map(i=>i.id));
  return {...salvo,naoPersistidas:emCurso.filter(i=>!ids.has(i.id))};
 }
 return {fechar:()=>{canal?.close();Promise.allSettled([corrente,capturas]).then(()=>fila.fechar()).catch(()=>{});},adicionar,adicionarArquivos,migrar,atualizar,materializar,executar,consultarExistente,previa,resolver,reconhecerLeitura,descartar,retomarAutomaticas,esperar:()=>Promise.all([corrente,capturas]),exportar,itens:()=>[...items,...avisos,...[...volateis.values()].map(p=>({id:p.id,original:{modulo:p.modulo,intencao:p.intencao},estado:'persistencia_falhou',tentativas:0,proximaTentativa:Number.MAX_SAFE_INTEGER}))]};
}
