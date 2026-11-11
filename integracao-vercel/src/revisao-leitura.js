import {divergenciasConfirmacao} from './confirmacao-mutacoes.js';
import {divergenciasArquivos} from './arquivos-intencoes.js';
import {recortarIntencao} from './intencoes-edicao.js';
import {preservarDerivadasFixadas} from './projecoes-derivadas.js';

export function arquivosAtuais(item, state) {
 const rows=state.base?.integracao_arquivos||[];
 return Object.fromEntries(Object.keys(item.preparado?.sent||{}).map(id=>[id,structuredClone(rows.find(r=>r.registro_id===id)?.dados||null)]));
}
export function snapshotLeitura(item,state,edicoes) {
 return {dados:recortarIntencao(state.db,edicoes,{preservarDerivadas:preservarDerivadasFixadas(item)}),arquivos:arquivosAtuais(item,state)};
}
export async function revisarLeitura(item,state) {
 if(!item.recibo||!item.preparado)return null;
 return {
  campos:divergenciasConfirmacao(item.preparado.antes,item.preparado.depois,state.db,item.recibo.aliases||{},item.payload||[]),
  arquivos:await divergenciasArquivos(item.preparado.sent||{},state.base||{},item.conta),
 };
}
