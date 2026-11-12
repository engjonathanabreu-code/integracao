import {terminal} from './estado-sincronizacao.js';
import {igualSemantico} from './igualdade-semantica.js';
const prefixo='integracao-meta-arq-v1-';
const sessaoAlterada=()=>Object.assign(new Error('A conta da cópia de recuperação mudou.'),{code:'SESSAO_ALTERADA'});

// These files have their own upload path. Do not register the prefix in the
// generic file queue: that would create a second upload protocol for the bytes.
export async function recuperarAnexosMetas({diario,envio,conta,storage,conferir=()=>{}}){
 conferir();if(diario?.conta&&diario.conta!==conta)throw sessaoAlterada();
 const chaves=new Set(),ausentes=[];
 const coletar=meta=>{
  if(!Array.isArray(meta?.arquivos))return;
  for(const arquivo of meta.arquivos){
   const chave=arquivo?.chave;
   if(typeof chave!=='string'||!chave.startsWith(prefixo))continue;
   if(chave.length<=256&&/^integracao-meta-arq-v1-[a-zA-Z0-9_-]+$/.test(chave))chaves.add(chave);
   else ausentes.push({chave:null,codigo:'CHAVE_META_INVALIDA'});
  }
 };
 for(const item of [...(diario?.intencoes||[]),...(diario?.naoPersistidas||[])]){
  if(terminal(item))continue;
  if(item.conta&&item.conta!==conta)throw sessaoAlterada();
  const original=item.original||item,ids=new Set();
  for(const edicao of original.intencao?.edicoes||[]){
   if(edicao.colecao!=='metas')continue;
   for(const lado of [edicao.antes,edicao.depois])if(lado?.existe){
    for(const meta of Array.isArray(lado.valor)?lado.valor:[lado.valor]){if(meta?.id)ids.add(meta.id);coletar(meta);}
   }
   if(edicao.id)ids.add(edicao.id);
  }
  for(const op of item.payload||original.operacoes||[])if(op.table==='meta_arquivos'&&op.changes?.meta_id)ids.add(op.changes.meta_id);
  for(const id of [...ids])if(item.recibo?.aliases?.[id])ids.add(item.recibo.aliases[id]);
  for(const snapshot of [item.preparado?.antes,item.preparado?.depois,original.legado?.before,original.legado?.after]){
   for(const meta of snapshot?.metas||[])if(ids.has(meta.id))coletar(meta);
  }
 }
 if(envio){
  const antes=envio.before?.metas||[],depois=envio.after?.metas||[];
  const ids=new Set([...antes,...depois].filter(meta=>!igualSemantico(antes.find(m=>m.id===meta.id),depois.find(m=>m.id===meta.id))).map(meta=>meta.id));
  for(const meta of [...antes,...depois])if(ids.has(meta.id))coletar(meta);
 }
 const arquivos={};
 for(const chave of chaves){
  conferir();let valor;
  try{valor=await storage.get(chave);}
  catch(e){conferir();if(e.code==='SESSAO_ALTERADA')throw e;ausentes.push({chave,codigo:'LEITURA_LOCAL_INDISPONIVEL'});continue;}
  conferir();
  if(typeof valor!=='string'||!/^data:[^,]*,/.test(valor)){ausentes.push({chave,codigo:'ARQUIVO_LOCAL_AUSENTE'});continue;}
  arquivos[chave]=valor;
 }
 conferir();return {versao:1,escopo:'anexos_de_intencoes_atuais',conta,arquivos,ausentes,completa:ausentes.length===0};
}
