const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
export const identidadeMeta=v=>String(v||'').replace(/^erp_/,'');
export const responsavelMeta=(meta,usuario)=>(meta.responsaveis||[]).some(id=>[usuario.id,usuario.erpRef].filter(Boolean).some(x=>identidadeMeta(x)===identidadeMeta(id)));
export function metasLocaisParaCompartilhar(base,db,usuario) {
 const existentes=new Set((base.metas||[]).map(m=>m.id));
 const usuarios=new Set((base.profiles||[]).map(p=>p.id));
 return (db.metas||[]).filter(m=>uuid(m.id)&&!existentes.has(m.id)&&!m._compartilhado&&
  (usuario.setor==='diretoria'||[usuario.id,usuario.erpRef].filter(Boolean).some(id=>identidadeMeta(id)===identidadeMeta(m.criadoPor)))&&
  (m.responsaveis||[]).every(id=>usuarios.has(identidadeMeta(id))));
}
