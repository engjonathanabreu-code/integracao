import {conciliarEdicoes} from './concorrencia.js';
// Advance only the unedited baseline. Local edits retain their original values
// for conflict detection, while unrelated remote changes remain visible.
export function atualizarComRascunho(base,local,remoto){
 const resultado=conciliarEdicoes(base,local,remoto);
 return {...resultado,baseline:conciliarEdicoes(local,base,remoto).dados};
}
export const rejeicaoDefinitiva=e=>['42501','PT409','40001'].includes(e?.code)||e?.status===403;
