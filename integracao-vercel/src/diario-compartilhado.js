import {abrirFilaIntencoes,processarIntencao,checksumIntencao} from './fila-intencoes.js';
import {extrairIntencao,recursosIntencao,aplicarIntencao,semearOriginais,recortarIntencao} from './intencoes-edicao.js';
import {referenciasIdentidades,remapearIdentidades} from './aliases-tipados.js';
import {igualSemantico} from './igualdade-semantica.js';
const terminal=i=>['confirmado','substituido','dispensado'].includes(i.estado);
const uuidHash=h=>`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
export function criarDiarioCompartilhado({conta,ativo,carregar,preparar,enviar,consultarRecibo,confirmar,atualizou,notificar=()=>{},fila=abrirFilaIntencoes()}){
 const canal=typeof BroadcastChannel==='function'?new BroadcastChannel('integracao-diario-v2:'+conta):null;
 if(canal)canal.onmessage=()=>{if(ativo())notificar();};
 const sinalizar=()=>canal?.postMessage({protocolo:2});
 const dono=crypto.randomUUID();let corrente=Promise.resolve(),items=[],revisao=null;const volateis=new Map(),avisos=[];
 const conferir=()=>{if(!ativo())throw Object.assign(Error('Sessão encerrada.'),{code:'SESSAO_ALTERADA'});};
 const atualizar=async()=>{const novos=await fila.listar(conta);conferir();items=novos;atualizou([...items,...avisos,...[...volateis.values()].map(p=>({id:p.id,original:{modulo:p.modulo,intencao:p.intencao},estado:'persistencia_falhou',tentativas:0}))]);return items;};
 const aliases=()=>Object.assign({},...items.filter(i=>i.recibo).map(i=>i.recibo.aliases||{}));
 function materializar(remoto){let db=structuredClone(remoto);for(const item of items.filter(i=>!terminal(i)))db=aplicarIntencao(db,item.original.intencao.edicoes||[],{aliases:aliases()}).dados;for(const p of volateis.values())db=aplicarIntencao(db,p.intencao.edicoes,{aliases:aliases()}).dados;return db;}
 function adicionar(antes,depois,arquivos={},opcoes={}){
  const edicoes=extrairIntencao(antes,depois),id=opcoes.id||crypto.randomUUID();
  if(!edicoes.length&&!Object.keys(arquivos).length&&!opcoes.legado)return Promise.resolve(null);
  const recursos=[...recursosIntencao(edicoes),...Object.keys(arquivos).map(k=>'arquivo:'+k)];
  const payload={conta,id,unidade:recursos[0]||'auditoria:'+id,recursos,modulo:edicoes.find(e=>e.colecao!=='auditoria')?.colecao||'arquivos',dependencias:opcoes.dependencias||[],referencias:referenciasIdentidades(edicoes),criadas:edicoes.filter(e=>e.id&&!e.antes.existe).map(e=>e.id),operacoes:opcoes.legado?.operations||[],preparar:!opcoes.legado,base:{},intencao:{edicoes,arquivos},legado:opcoes.legado||null};
  volateis.set(id,payload);
  // Serialization stays local to this controller; the database also orders other tabs.
  const trabalho=corrente.catch(()=>{}).then(async()=>{const item=await fila.enfileirar(payload);volateis.delete(id);sinalizar();if(ativo())await atualizar();return item;});corrente=trabalho;return trabalho;
 }
 async function importarLegado(texto){
  if(!texto)return;await fila.preservarLegado(conta,texto);conferir();
  let draft;try{draft=JSON.parse(texto);}catch{throw Error('O rascunho antigo foi preservado, mas precisa de revisão por estar ilegível.');}
  if(!draft.pending&&!draft.attempt)return;
  if(!draft.baseline||!draft.db)throw Error('Rascunho antigo preservado sem base original; exporte para revisão seletiva.');
  const hash=await checksumIntencao(texto);conferir();
  if(draft.attempt){
   const a=draft.attempt;if(!a.id||!a.before||!a.after||!Array.isArray(a.operations))throw Error('Tentativa antiga incompleta; original preservado para revisão.');
   await adicionar(a.before,a.after,a.sent||{},{id:a.id,legado:a});conferir();
   await adicionar(a.after,draft.db,{}, {id:uuidHash(hash),dependencias:[a.id]});
  }else await adicionar(draft.baseline,draft.db,{}, {id:uuidHash(hash)});
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
  conferir();const edicoes=remapearIdentidades(item.original.intencao.edicoes||[],aliases());
  const remoto=await carregar(edicoes);conferir();return {remoto,edicoes};
 }
 async function prepararItem(item){
  const {remoto,edicoes}=await lerItem(item),r=aplicarIntencao(remoto.db,edicoes);
  if(r.conflitos.length)throw Object.assign(Error('Há valores diferentes no servidor. Revise esta alteração.'),{code:'PT409',status:409});
  const pronto=await preparar(remoto,r.dados,item.original.intencao.arquivos);conferir();return {...pronto,antes:recortarIntencao(remoto.db,edicoes),depois:recortarIntencao(r.dados,edicoes)};
 }
 async function executar(){
  await corrente.catch(()=>{});conferir();await atualizar();
  // Bound each pass; a later pass resumes independently ready entries.
  const limite=items.filter(i=>!terminal(i)).length;
  for(let n=0;n<limite;n++){
   conferir();let resultado;
   try{resultado=await processarIntencao(fila,{conta,dono,sessaoAtual:ativo,preparar:prepararItem,consultarRecibo,enviar:async item=>enviar(item.payload,item.pedido,item.preparado.depois),reler:async item=>{
    const {remoto}=await lerItem(item);conferir();await confirmar(item,remoto);conferir();
   }});}catch(e){if(e.code==='SESSAO_ALTERADA')throw e;resultado=true;}
   await atualizar();if(!resultado)break;sinalizar();
  }
  return items;
 }
 async function previa(id){
  await corrente.catch(()=>{});if(avisos.some(a=>a.id===id)){const a=avisos.find(a=>a.id===id);return {id,item:a,conflitos:[],edicoes:[],dados:{},somenteExportar:true};}if(volateis.has(id)){const p=volateis.get(id);await fila.enfileirar(p);volateis.delete(id);}await atualizar();const item=items.find(i=>i.id===id);if(!item||terminal(item))throw Error('Esta pendência já foi concluída.');
  const {remoto,edicoes}=await lerItem(item);const r=aplicarIntencao(remoto.db,edicoes);
  revisao={id,item,remoto:remoto.db,edicoes,conflitos:r.conflitos};return {...revisao,dados:r.dados};
 }
 async function resolver(id,escolhas){
  if(!revisao||revisao.id!==id)throw Error('Abra a prévia da pendência antes de confirmar.');
  const mostrada=revisao,{remoto}=await lerItem(mostrada.item);
  if(!igualSemantico(remoto.db,mostrada.remoto))throw Error('Os dados mudaram. Abra novamente a prévia e confira os valores.');
  const r=aplicarIntencao(remoto.db,mostrada.edicoes,{escolhas});if(r.conflitos.length)throw Error('Escolha todos os valores em conflito.');
  if(mostrada.item.recibo&&mostrada.conflitos.length){
   if(!igualSemantico(r.dados,remoto.db))throw Error('Esta gravação já tem recibo. Reconheça o valor atual compartilhado e depois abra o registro para fazer uma nova edição.');
   await fila.aceitarLeituraAtual(conta,id);revisao=null;await atualizar();return;
  }
  if(!['bloqueado_conflito','bloqueado_validacao'].includes(mostrada.item.estado)){
   // Unknown writes and receipts are never replaced with a new request.
   await fila.retomar(conta,id);await atualizar();return;
  }
  let edicoes=extrairIntencao(remoto.db,r.dados);
  // Explicitly accepting the server still leaves an auditable no-op replacement.
  if(!edicoes.length){await fila.aceitarRemoto(conta,id);revisao=null;await atualizar();return;}
  const novo=await adicionar(remoto.db,r.dados,mostrada.item.original.intencao.arquivos);
  await fila.substituir(conta,id,novo.id);revisao=null;await atualizar();
 }
 return {fechar:()=>{canal?.close();corrente.finally(()=>fila.fechar()).catch(()=>{});},adicionar,migrar,atualizar,materializar,executar,previa,resolver,esperar:()=>corrente,exportar:async()=>({...await fila.exportar(conta),naoPersistidas:[...volateis.values()]}),itens:()=>[...items,...avisos,...[...volateis.values()].map(p=>({id:p.id,original:{modulo:p.modulo,intencao:p.intencao},estado:'persistencia_falhou',tentativas:0,proximaTentativa:Number.MAX_SAFE_INTEGER}))]};
}
