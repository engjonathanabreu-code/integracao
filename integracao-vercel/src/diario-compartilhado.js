import {conflitoReconciliavelPreferencias,escopoPreferencias,provarPreferenciasNoServidor} from './reconciliacao-preferencias.js';
import {conferirRetomadaCrm,elegivelRetomadaCrm} from './retomada-remota-validacao.js';
import {motivoEspera} from './estado-sincronizacao.js';
import {validarVinculoMoradoresDoEnvio} from './dados-compartilhados.js';
import {provarMetasNoServidor,conflitoReconciliavelMetas} from './reconciliacao-metas.js';
import {ajustarComparacaoFinanceira} from './contrato-financeiro.js';
import {revisaoDeRecusa,classificarFalha} from './estado-sincronizacao.js';
export {motivoEspera} from './estado-sincronizacao.js';
import {edicaoDerivada,preservarDerivadasFixadas} from './projecoes-derivadas.js';
import {abrirFilaIntencoes,processarIntencao,lerIntencaoExistente,reconciliarIntencaoMetas,recusadoComReciboConsultavel,checksumIntencao} from './fila-intencoes.js';
import {extrairIntencao,recursosIntencao,aplicarIntencao,semearOriginais,recortarIntencao} from './intencoes-edicao.js';
import {referenciasIdentidades,remapearIdentidades} from './aliases-tipados.js';
import {igualSemantico} from './igualdade-semantica.js';
import {alteracoesConfirmadas} from './confirmacao-mutacoes.js';
import {edicaoSomenteLocal} from './intencoes-locais.js';
import {arquivosDaIntencao,arquivoEmConflito,conflitoArquivoReconciliavel} from './arquivos-intencoes.js';
import {arquivoPresenteIdentico,confirmarArquivos} from './arquivos-compartilhados.js';
import {revisarLeitura,snapshotLeitura,arquivosAtuais} from './revisao-leitura.js';
const terminal=i=>['confirmado','substituido','dispensado'].includes(i.estado);
const uuidHash=h=>`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
export function criarDiarioCompartilhado({conta,ativo,carregar,preparar,projetarProvaMetas=r=>r,planejarMetas,confirmarEstado=()=>{},enviar,consultarRecibo,confirmar,aceitarLeitura=async()=>{},atualizou,notificar=()=>{},estadoSessao,conferirArquivo=arquivoPresenteIdentico,concluirArquivos=confirmarArquivos,fila=abrirFilaIntencoes()}){
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
  // C4: an entry with a receipt whose read-back diverged stays visible while it
  // waits. Conflicting leaves still show the server value (see `aplicar`), the
  // entry stays pending and nothing here confirms it. Hiding it made the next
  // edit capture the stale value and conflict with the user's own first edit.
  for(const item of items.filter(i=>!terminal(i)))aplicar(item.original.intencao.edicoes||[]);
  for(const p of volateis.values())aplicar(p.intencao.edicoes);
  return db;
 }
 function adicionar(antes,depois,arquivos={},opcoes={}){
  // Notification retention is local; the encoder never sends these removals.
  // Do not make a new sync entry or dependency out of unsent changes.
  const edicoes=extrairIntencao(antes,depois).filter(e=>opcoes.legado||opcoes.substituirId||
   !(e.colecao==='notificacoes'&&e.id&&e.antes?.existe===true&&e.antes.valor?.id===e.id&&e.depois?.existe===false));
  const id=opcoes.id||crypto.randomUUID();
  if(!edicoes.length&&!Object.keys(arquivos).length&&!opcoes.legado)return Promise.resolve(null);
  const recursos=[...recursosIntencao(edicoes),...Object.keys(arquivos).map(k=>'arquivo:'+k)];
  const payload={conta,id,unidade:recursos[0]||'auditoria:'+id,recursos,modulo:edicoes.find(e=>e.colecao!=='auditoria')?.colecao||'arquivos',dependencias:opcoes.dependencias||[],referencias:referenciasIdentidades(edicoes),criadas:edicoes.filter(e=>e.id&&!e.antes.existe).map(e=>e.id),operacoes:opcoes.legado?.operations||[],preparar:!opcoes.legado,base:{},intencao:{edicoes,arquivos},legado:opcoes.legado||null};
  if(opcoes.substituirId)payload.substituirId=opcoes.substituirId;
  volateis.set(id,payload);
  // Serialization stays local to this controller; the database also orders other tabs.
  const trabalho=corrente.catch(()=>{}).then(async()=>{let item;try{item=await fila.enfileirar({...payload,retomadaRemota:opcoes.retomadaRemota});}catch(e){if(opcoes.retomadaRemota||(opcoes.substituirId&&e.code==='REVISAO_NECESSARIA'))volateis.delete(id);throw e;}volateis.delete(id);sinalizar();if(ativo())await atualizar();return item;});corrente=trabalho;return trabalho;
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
  const prova=planejarMetas&&(r.conflitos.length||igualSemantico(recortarIntencao(r.dados,edicoes),recortarIntencao(remoto.db,edicoes)))&&verificarMetas(item,remoto,edicoes);
  if(prova)return {provaEstado:prova,aposConfirmar:()=>confirmarEstado(item,remoto,prova)};
  if(r.conflitos.length)throw Object.assign(Error('Há valores diferentes no servidor. Revise esta alteração.'),{code:'PT409',status:409});
  const pronto=await preparar(remoto,r.dados,arquivosDaIntencao(item,items));conferir();
  // Nothing to write and no file involved: if every edited record, after the
  // merge, is what this fresh read already returns (same confirmation contract,
  // no payload), the request is closed as already present instead of parking as
  // "no operations". Any strict difference keeps the previous review path.
  const semArquivos=x=>!Object.keys(x||{}).length;
  if(Array.isArray(pronto?.operacoes)&&!pronto.operacoes.length&&semArquivos(pronto.sent)&&semArquivos(pronto.identicos)&&semArquivos(arquivosDaIntencao(item,items))){
   const gravaveis=edicoes.filter(e=>!edicaoSomenteLocal(e)&&!edicaoDerivada(e));
   if(alteracoesConfirmadas(recortarIntencao(remoto.db,gravaveis),recortarIntencao(r.dados,gravaveis),remoto.db,{},[]))
    return {...pronto,jaPresente:{tipo:'ja_presente_no_servidor',checksum:item.checksum}};
  }
  // Not enumerable: the prepared result is cloned into the journal when fixed.
  return Object.defineProperty({...pronto,antes:recortarIntencao(remoto.db,edicoes),depois:recortarIntencao(r.dados,edicoes)},'aposDispensar',{value:()=>encerrarArquivos(pronto.sent,remoto)});
 }
 // The request is already closed durably. Consuming the same version from the
 // auxiliary file queue revalidates it against this read; a failure only
 // leaves that entry for the normal recovery on the next pass.
 const encerrarArquivos=async(sent,remoto)=>{try{await concluirArquivos(sent||{},remoto.base||{});}catch{/* kept for recovery */}};
 // A refused single-file conflict is closed only when the current row and the
 // stored bytes are exactly what this request tried to write.
 async function provarArquivoPresente(item){
  if(!arquivoEmConflito(item))return null;
  const [id,arquivo]=Object.entries(item.original.intencao.arquivos)[0],dados=item.payload[0].changes.dados;
  const {remoto}=await lerItem(item);
  if(!await conferirArquivo(remoto.base?.integracao_arquivos,id,dados,new TextEncoder().encode(arquivo.value)))return null;
  conferir();
  return {prova:{tipo:'arquivo_ja_presente_no_servidor',id,version:arquivo.version,dados:structuredClone(dados)},aposConfirmar:()=>encerrarArquivos({[id]:arquivo},remoto)};
 }
 function verificarMetas(item,remoto,edicoes){
  try{return provarMetasNoServidor(item,edicoes,projetarProvaMetas(remoto,edicoes),items,planejarMetas);}catch{return null;}
 }
 async function executar({id=null,validar=async()=>{},verificar=()=>{}}={}){
  await capturas.catch(()=>{});await corrente.catch(()=>{});conferir();await atualizar();
  // Bound each pass; a later pass resumes independently ready entries.
  const limite=id?1:items.filter(i=>!terminal(i)).length;
  const tentados=[];
  if(!id){
   // Read-only blocked conflicts first, so their dependent requests can then be
   // evaluated in order. No repeated queries for the same item within the pass.
   const lidos=[];
   for(let n=0;n<limite&&items.some(i=>!lidos.includes(i.id)&&(planejarMetas&&conflitoReconciliavelMetas(i,Date.now())||conflitoArquivoReconciliavel(i,Date.now())||conflitoReconciliavelPreferencias(i,Date.now())||recusadoComReciboConsultavel(i,Date.now())));n++){
    const resultado=await reconciliarIntencaoMetas(fila,{conta,dono,estadoSessao,ignorarIds:lidos,aoReservar:id=>lidos.push(id),sessaoAtual:()=>{verificar();return ativo();},consultarRecibo:async item=>{await validar();conferir();verificar();return consultarRecibo(item);},reler:async item=>{
     const {remoto}=await lerItem(item);conferir();verificar();await confirmar(item,remoto);conferir();verificar();
    },provar:async item=>{
     if(escopoPreferencias(item)){
      await validar();conferir();
      const {remoto,edicoes}=await lerItem(item);
      const prova=provarPreferenciasNoServidor(item,edicoes,remoto);
      if(prova)return {prova,aposConfirmar:()=>confirmarEstado(item,remoto,{...prova,depois:recortarIntencao(remoto.db,edicoes),operacoes:item.payload})};
     }
     if(arquivoEmConflito(item))return provarArquivoPresente(item);
     if(!planejarMetas)return null;
     const {remoto,edicoes}=await lerItem(item);
     const prova=verificarMetas(item,remoto,edicoes);
     return prova&&{prova,aposConfirmar:()=>confirmarEstado(item,remoto,prova)};
    }});
    if(resultado===null)break;
    await atualizar();if(resultado)sinalizar();
   }
  }

  for(let n=0;n<limite;n++){
   conferir();let resultado;
   try{resultado=await processarIntencao(fila,{conta,dono,estadoSessao,somenteId:id,ignorarIds:tentados,aoReservar:pedido=>tentados.push(pedido),sessaoAtual:()=>{verificar();return ativo();},preparar:async item=>{await validar();verificar();return prepararItem(item);},consultarRecibo:async item=>{await validar();verificar();return consultarRecibo(item);},provarEstado:planejarMetas?async item=>{
    const {remoto,edicoes}=await lerItem(item);
    const prova=verificarMetas(item,remoto,edicoes);
    return prova&&{prova,aposConfirmar:()=>confirmarEstado(item,remoto,prova)};
   }:undefined,validarEnvio:item=>validarVinculoMoradoresDoEnvio(item.payload,item.preparado?.depois),enviar:async item=>{await validar();verificar();return enviar(item.payload,item.pedido,item.preparado.depois);},reler:async item=>{
    await validar();verificar();
    const {remoto}=await lerItem(item);conferir();await confirmar(item,remoto);conferir();
   }});}catch(e){
    if(e.code==='SESSAO_ALTERADA')throw e;
    // C1/C2: a session failure is not about this item. Abort the pass without
    // reserving or preparing others; it resumes after a valid session.
    if(classificarFalha(e).categoria==='sessao'){await atualizar();break;}
    resultado=true;
   }
   await atualizar();if(!resultado)break;sinalizar();
  }
  return items;
 }
 async function consultarExistente(id,{modo='consulta',validar=async()=>{},verificar=()=>{}}={}){
  await capturas.catch(()=>{});await corrente.catch(()=>{});conferir();verificar();await atualizar();
  try{return await lerIntencaoExistente(fila,{conta,dono,estadoSessao,id,modo,sessaoAtual:()=>{verificar();return ativo();},consultarRecibo:async item=>{await validar();verificar();return consultarRecibo(item);},reler:async item=>{
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
 async function retomarRecusaCrm({pedido,revisao:revisaoSolicitada,validar,verificar}){
  await capturas;await corrente;conferir();verificar();await atualizar();verificar();
  const item=items.find(i=>i.id===pedido),alvo={conta,pedido,revisao:revisaoSolicitada};
  if(!elegivelRetomadaCrm(item,alvo)||motivoEspera(item,items))return null;
  let leitura=null;
  const resposta=await conferirRetomadaCrm({item,alvo,consultarRecibo,revalidar:validar,verificar,reler:async()=>{
   leitura=await lerItem(item);
   // A remapped ID is a distinct recovery target and must be reviewed locally.
   if(!igualSemantico(leitura.edicoes,item.original.intencao.edicoes))return null;
   const {db}=leitura.remoto;
   const e=leitura.edicoes.find(x=>x.colecao==='processos'),l=leitura.edicoes.find(x=>x.colecao==='auditoria');
   if(!Array.isArray(db.processos)||!Array.isArray(db.auditoria))return null;
   return {cadastro:db.processos.find(x=>x.id===e.id),auditoria:db.auditoria.find(x=>x.id===l.id)??null};
  }});
  if(resposta.codigo!=='PREVIA_VALIDADA')return null;
  const {remoto,edicoes}=leitura;
  const proposta=aplicarIntencao(remoto.db,edicoes);
  if(proposta.conflitos.length||extrairIntencao(remoto.db,proposta.dados).length!==2)return null;
  await validar();verificar();
  if(await consultarRecibo(item)!==null)return null;
  await validar();verificar();conferir();
  return adicionar(remoto.db,proposta.dados,{},{substituirId:pedido,retomadaRemota:{revisao:revisaoSolicitada,verificar}});
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
  if(mostrada.item.erro?.codigo==='PT409'&&Object.keys(arquivos).length){
   // "Keep my version" after a refused file conflict: the replacement is based
   // on the server pointer shown in the preview, so it can replace exactly that
   // pointer. The server compare-and-set still refuses any later change.
   if(!igualSemantico(arquivosAtuais(mostrada.item,remoto),mostrada.snapshot?.arquivos))throw Error('Os dados ou arquivos mudaram. Abra novamente a prévia e confira os valores.');
   const linhas=remoto.base?.integracao_arquivos||[];
   // Only pointers the preview actually displayed may be rebased; any other
   // file keeps its original base, which the server still refuses if stale.
   const exibidos=mostrada.snapshot?.arquivos||{};
   for(const [arquivoId,arquivo] of Object.entries(arquivos))if(Object.hasOwn(exibidos,arquivoId))arquivo.expected=structuredClone(linhas.find(l=>l.registro_id===arquivoId)?.dados??null);
  }
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
 async function rearmarCadastro(auditoriaId){
  await corrente.catch(()=>{});conferir();
  const rearmado=await fila.rearmarCadastro(conta,auditoriaId);conferir();
  if(rearmado){await atualizar();sinalizar();}
  return rearmado;
 }
 async function verificarPreparacoesAoReconectar(){
  await corrente.catch(()=>{});conferir();
  const total=await fila.reabrirPreparacoesAoReconectar(conta);conferir();
  if(total){await atualizar();sinalizar();}
  return total;
 }
 async function verificarReleiturasTemporarias(){
  await corrente.catch(()=>{});conferir();
  const total=await fila.reabrirReleiturasTemporarias(conta);conferir();
  if(total){await atualizar();sinalizar();}
  return total;
 }
 // C5: called on `online`, focus/visibility, a valid `integracao:sessao` and
 // the 120 s tick. Only transient/session items; review stays untouched.
 async function retomarTransitorias(motivo='manual'){
  await corrente.catch(()=>{});conferir();
  const total=await fila.retomarTransitorias(conta);conferir();
  if(total){await atualizar();sinalizar();}
  return {motivo,total};
 }
 async function retomarAutomaticas({id=null}={}){
  await corrente.catch(()=>{});conferir();await atualizar();
  for(const item of items)if((!id||item.id===id)&&!terminal(item)&&!item.estado.startsWith('bloqueado')&&item.proximaTentativa===Number.MAX_SAFE_INTEGER){await fila.retomar(conta,item.id);conferir();}
  await atualizar();
 }
 async function snapshotPendencias(){
  await capturas.catch(()=>{});
  const emCurso=structuredClone([...volateis.values()]);
  const todas=await fila.listar(conta);conferir();
  const ids=new Set(todas.map(i=>i.id));
  return {intencoes:todas.filter(i=>!terminal(i)),naoPersistidas:emCurso.filter(i=>!ids.has(i.id))};
 }
 async function exportar(){
  await capturas.catch(()=>{});
  const emCurso=structuredClone([...volateis.values()]);
  const salvo=await fila.exportar(conta),ids=new Set(salvo.intencoes.map(i=>i.id));
  return {...salvo,naoPersistidas:emCurso.filter(i=>!ids.has(i.id))};
 }
 return {fechar:()=>{canal?.close();Promise.allSettled([corrente,capturas]).then(()=>fila.fechar()).catch(()=>{});},adicionar,adicionarArquivos,migrar,atualizar,materializar,executar,consultarExistente,retomarRecusaCrm,previa,resolver,reconhecerLeitura,descartar,retomarAutomaticas,retomarTransitorias,rearmarCadastro,verificarPreparacoesAoReconectar,verificarReleiturasTemporarias,esperar:()=>Promise.all([corrente,capturas]),snapshotPendencias,exportar,itens:()=>[...items,...avisos,...[...volateis.values()].map(p=>({id:p.id,original:{modulo:p.modulo,intencao:p.intencao},estado:'persistencia_falhou',tentativas:0,proximaTentativa:Number.MAX_SAFE_INTEGER}))]};
}
