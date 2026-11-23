import {ideiaPlanejamento} from './planejamento-metas.js';
import {acaoPermitida} from './permissoes-contrato.js';
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
export const identidadeMeta=v=>String(v||'').replace(/^erp_/,'');
export const responsavelMeta=(meta,usuario)=>(meta.responsaveis||[]).some(id=>[usuario.id,usuario.erpRef].filter(Boolean).some(x=>identidadeMeta(x)===identidadeMeta(id)));
export function metasLocaisParaCompartilhar(base,db,usuario) {
 const existentes=new Set((base.metas||[]).map(m=>m.id));
 const usuarios=new Set((base.profiles||[]).map(p=>p.id));
 return (db.metas||[]).filter(m=>!ideiaPlanejamento(m)&&uuid(m.id)&&!existentes.has(m.id)&&!m._compartilhado&&
  (usuario.setor==='diretoria'||[usuario.id,usuario.erpRef].filter(Boolean).some(id=>identidadeMeta(id)===identidadeMeta(m.criadoPor)))&&
  (m.responsaveis||[]).every(id=>usuarios.has(identidadeMeta(id))));
}

export const podeAnalisarDevolutiva=(meta,usuario)=>!!usuario&&usuario.ativo!==false&&(usuario.setor==='diretoria'||!!meta&&responsavelMeta(meta,usuario));

// Same canonical role names as integracao_metas_privado.gerencia(). A local
// sector, duty label or a positive contract is not a substitute for the role.
export function podeGerirDevolutivaPosProtocolo(meta,usuario) {
 if(!['Pós-protocolo','Pós Protocolo'].includes(usuario?.tipoERP)||
   !acaoPermitida(usuario,'metas','ler',true))return false;
 return meta
  ? !!meta.devolutiva&&meta.associacao_tipo==='nucleo'&&!!meta.associacao_id&&acaoPermitida(usuario,'metas','editar',true)
  : acaoPermitida(usuario,'metas','criar',true);
}
export const podeAnexarDevolutivaPosProtocolo=(meta,usuario)=>
 podeGerirDevolutivaPosProtocolo(meta,usuario)&&acaoPermitida(usuario,'documentos','criar',true);

// Administrative fields of the return, not the general meta, assignments,
// its historical files, analysis or linkage. Metadata edits are not uploads.
export function comEdicaoDevolutiva(meta,campos,anexos=[]) {
 const existentes=meta.arquivos||[];
 if(anexos.length&&existentes.length+anexos.length>5)throw Error('Cada devolutiva permite até 5 arquivos.');
 const mudancas=Object.fromEntries(['origem','chegada','prazo','textoOriginal'].filter(k=>Object.hasOwn(campos,k)).map(k=>[k,campos[k]]));
 return {...meta,devolutiva:{...meta.devolutiva,...mudancas},arquivos:[...existentes,...anexos]};
}
export function validarLoteDevolutiva(arquivos,existentes,extensoes,limiteBytes) {
 if(arquivos.length+existentes>5)return 'Cada devolutiva permite até 5 arquivos.';
 if(arquivos.some(a=>!Number.isFinite(a.size)||a.size<=0||a.size>limiteBytes))return 'Cada arquivo deve ter conteúdo e pode ter até 25 MB.';
 if(arquivos.some(a=>!extensoes.some(ext=>a.name.toLowerCase().endsWith(ext))||
  (a.type&&a.type!=='application/octet-stream'&&a.type!=='application/pdf'&&!a.type.startsWith('image/'))))return 'Selecione PDF ou imagem.';
 return '';
}
// Chaves locais mudam ao sincronizar. IDs permanecem; nomes únicos atendem relatórios antigos.
export function arquivosOriginaisDevolutiva(meta){
 const todos=(meta?.arquivos||[]).filter(a=>/^(application\/pdf|image\/)/.test(a.tipo||''));
 const analise=meta?.devolutiva?.analiseIA;
 const corresponde=(a,refs)=>refs.some(r=>(r.id&&r.id===a.id)||(r.chave&&r.chave===a.chave)||(!r.id&&r.nome===a.nome&&todos.filter(x=>x.nome===r.nome).length===1));
 const originais=analise?.etapa1?.arquivosAnalisados||[],respostas=analise?.etapa2?.arquivosAnalisados||[];
 return originais.length?todos.filter(a=>corresponde(a,originais)):todos.filter(a=>!corresponde(a,respostas));
}
