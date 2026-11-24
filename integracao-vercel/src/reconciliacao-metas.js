import {alteracoesConfirmadas} from './confirmacao-mutacoes.js';
import {igualSemantico as igual} from './igualdade-semantica.js';
import {recortarIntencao} from './intencoes-edicao.js';
import {arquivosDaIntencao} from './arquivos-intencoes.js';

const uuid=id=>typeof id==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const chaves={metas:['id'],meta_checklist:['id'],meta_historico:['id'],meta_comentarios:['id'],
 meta_responsaveis:['meta_id','usuario_id'],integracao_metas:['colecao','registro_id'],
 integracao_auditoria:['colecao','registro_id'],integracao_notificacoes:['colecao','registro_id']};

export function elegivelReconciliacaoMetas(item){
 const edicoes=item.original?.intencao?.edicoes;
 return !item.recibo&&!item.original?.legado&&Array.isArray(edicoes)&&edicoes.some(e=>e?.colecao==='metas')&&
  edicoes.every(e=>['metas','auditoria','notificacoes'].includes(e?.colecao)&&uuid(e.id)&&e.depois?.existe===true&&e.depois.valor?.id===e.id&&
   (e.antes?.existe===false||e.colecao!=='notificacoes'&&e.antes?.existe===true&&e.antes.valor?.id===e.id)&&!(e.colecao==='metas'&&!igual(e.antes?.valor?.arquivos||[],e.depois.valor.arquivos||[])))&&
  !Object.keys(item.preparado?.sent||{}).length&&!Object.keys(item.original.intencao.arquivos||{}).length;
}

export const conflitoReconciliavelMetas=(i,agora)=>i?.estado==='bloqueado_conflito'&&i.erro?.codigo==='PT409'&&
 (!i.reconciliacaoVerificadaEm||agora-i.reconciliacaoVerificadaEm>=120000)&&elegivelReconciliacaoMetas(i);

export function provarMetasNoServidor(item,edicoes,remoto,itens,gerarOperacoes){
 if(!elegivelReconciliacaoMetas(item)||!igual(edicoes,item.original.intencao.edicoes)||Object.keys(arquivosDaIntencao(item,itens)).length)return null;
 const antes=structuredClone(remoto.db),depois=structuredClone(remoto.db);
 for(const e of edicoes){
  for(const [db,v] of [[antes,e.antes],[depois,e.depois]]){
   db[e.colecao]=(db[e.colecao]||[]).filter(r=>r.id!==e.id);
   if(v.existe)db[e.colecao].push(v.valor);
  }
 }
 // Plan from the immutable edit, not a no-op diff between two remote snapshots.
 // This is pure encoding: no upload, reservation RPC or commit.
 const insercoesExtras=new Set(edicoes.filter(e=>e.colecao!=='metas'&&!e.antes.existe).map(e=>e.colecao+':'+e.id));
 const cenarioPlanejamento={...remoto,base:{...remoto.base,integracao_complementos:(remoto.base.integracao_complementos||[])
  .filter(r=>!insercoesExtras.has(r.colecao+':'+r.registro_id))}};
 const operacoes=item.payload||gerarOperacoes(antes,depois,cenarioPlanejamento);
 const metasEditadas=edicoes.filter(e=>e.colecao==='metas');
 if(!operacoes.length||!alteracoesConfirmadas(recortarIntencao(antes,metasEditadas),recortarIntencao(depois,metasEditadas),remoto.db,{},operacoes))return null;
 const metas=new Set(edicoes.filter(e=>e.colecao==='metas').map(e=>e.id));
 const auditorias=new Map(edicoes.filter(e=>e.colecao==='auditoria').map(e=>[e.id,e.depois.valor]));
 const notificacoes=new Map(edicoes.filter(e=>e.colecao==='notificacoes').map(e=>[e.id,e.depois.valor]));
 const operacoesMetas=new Set(),operacoesNotificacoes=new Set(),operacoesAuditoria=new Set();
 for(const op of operacoes){
  if(!Object.hasOwn(chaves,op.table)||op.action||op.tempId||op.remove)return null;
  const keys=chaves[op.table];
  if(!op.key||Object.keys(op.key).length!==keys.length||!keys.every(k=>Object.hasOwn(op.key,k)))return null;
  const rows=remoto.base[op.table];
  if(!Array.isArray(rows))return null;
  const achados=rows.filter(r=>keys.every(k=>r[k]===op.key[k]));
  if(achados.length!==1||!op.changes||!Object.keys(op.changes).length)return null;
  const row=achados[0];
  const filhos={meta_checklist:'checklist',meta_historico:'historico',meta_comentarios:'comentarios'};
  const filho=filhos[op.table];
  const alvo=filho?row.meta_id:op.key.meta_id??op.key.id??op.key.registro_id;
  if(op.table==='integracao_notificacoes'){
   if(op.key.colecao!=='notificacoes'||!notificacoes.has(alvo)||op.insert!==true||op.changes?.criado_por!==item.conta||
    !igual(op.changes.dados,notificacoes.get(alvo))||operacoesNotificacoes.has(alvo)||
    remoto.base.integracao_complementos?.some(r=>r.colecao==='notificacoes'&&r.registro_id===alvo&&(!r._tabela||r._tabela==='integracao_complementos')))return null;
   operacoesNotificacoes.add(alvo);
  }else if(op.table==='integracao_auditoria'){
   if(op.key.colecao!=='auditoria'||!auditorias.has(alvo)||op.insert!==true||op.changes?.criado_por!==item.conta||
    !igual(op.changes.dados,auditorias.get(alvo))||operacoesAuditoria.has(alvo))return null;
   operacoesAuditoria.add(alvo);
  }else if(!metas.has(alvo)||op.table==='integracao_metas'&&op.key.colecao!=='metas')return null;
  if(filho&&!edicoes.some(e=>e.colecao==='metas'&&e.id===alvo&&e.depois.valor[filho]?.some(x=>x.id===op.key.id)))return null;
  for(const [campo,valor] of Object.entries(op.changes)){
   // Complement updates timestamp the attempted save. Do not compare clocks
   // on retries, but keep all business fields and linkage exact.
   if(op.table==='integracao_metas'&&campo==='updated_at'&&!op.insert&&Number.isFinite(Date.parse(row[campo])))continue;
   if(campo==='concluido_em'&&op.table==='meta_checklist'&&typeof valor==='string'&&Number.isFinite(Date.parse(valor))&&Date.parse(valor)===Date.parse(row[campo]))continue;
   if(!Object.hasOwn(row,campo)||!igual(row[campo],valor))return null;
  }
  if(!['integracao_auditoria','integracao_notificacoes'].includes(op.table))operacoesMetas.add(alvo);
 }
 if([...metas].some(id=>!operacoesMetas.has(id))||notificacoes.size!==operacoesNotificacoes.size||auditorias.size!==operacoesAuditoria.size)return null;
 return {tipo:'metas_ja_presentes_no_servidor',checksum:item.checksum,antes,depois,operacoes};
}
