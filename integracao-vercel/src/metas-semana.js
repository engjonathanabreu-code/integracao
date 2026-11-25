import {segundaPlanejamento} from './planejamento-metas.js';
const DATA=/^\d{4}-\d{2}-\d{2}$/;
const dataValida=v=>typeof v==='string'&&DATA.test(v)&&!Number.isNaN(new Date(v+'T12:00:00').getTime());
// A semana de uma meta é sempre identificada pela segunda-feira. Texto que não
// é uma data completa (campo sendo apagado) volta como veio.
export const segundaDaMeta=v=>dataValida(v)?segundaPlanejamento(v):v;
// Ao salvar: a data escolhida vira a segunda-feira da semana. A data que a meta já
// tinha e não foi mexida fica como está (editar outro campo não regrava a semana).
export const semanaAoSalvar=(valor,original)=>valor===original?valor:segundaDaMeta(valor);
// Metas antigas podem ter sido gravadas com outro dia da semana: comparam pela segunda.
export const metaNaSemana=(meta,segunda)=>dataValida(meta?.semana_inicio)&&segundaPlanejamento(meta.semana_inicio)===segundaPlanejamento(segunda);
// Meta que o botão Editar do detalhe deve abrir; null quando ela já não existe.
export const metaParaEditar=(metas,id)=>(metas||[]).find(m=>m.id===id)||null;
