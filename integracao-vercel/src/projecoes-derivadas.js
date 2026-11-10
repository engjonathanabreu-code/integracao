// Explicit read-model fields, never user-editable data. Do not generalize this
// to every underscore key: unknown fields must retain their conflict checks.
export const colecaoDerivada=colecao=>colecao==='_contagensClientes';
export const edicaoDerivada=e=>colecaoDerivada(e?.colecao)&&e.id===undefined;

// New preparations omit the projection from both the snapshot and operations.
// Older/unknown preparations keep their original review and explicit decision.
export function preservarDerivadasFixadas(item){
 if(!item?.payload)return false;
 const p=item.preparado;
 if(!p?.antes||!p?.depois||!Array.isArray(item.payload))return true;
 return [p.antes,p.depois].some(db=>Object.hasOwn(db,'_contagensClientes'))||item.payload.some(op=>['integracao_configuracoes','integracao_complementos'].includes(op.table)&&op.key?.colecao==='config'&&op.key?.registro_id==='_contagensClientes');
}
