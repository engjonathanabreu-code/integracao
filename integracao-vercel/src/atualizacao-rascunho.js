import {conciliarEdicoes} from './concorrencia.js';
// Advance only the unedited baseline. Local edits retain their original values
// for conflict detection, while unrelated remote changes remain visible.
export function atualizarComRascunho(base,local,remoto){
 const resultado=conciliarEdicoes(base,local,remoto);
 return {...resultado,baseline:conciliarEdicoes(local,base,remoto).dados};
}
// A foreign-key violation rolls back the whole RPC transaction. Reconcile the
// archived draft against fresh rows instead of retrying an invalid cached batch.
export const rejeicaoDefinitiva=e=>['42501','PT409','40001','P0001','23503','23505','23514','23P01'].includes(e?.code)||e?.status===403;
