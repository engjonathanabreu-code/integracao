import {responsavelMeta} from './metas-identidade.js';
// Quadro de Metas Ativas: uma coluna por pessoa, só com quem tem metas em aberto no filtro escolhido.
export const SEM_SETOR_META='__sem_setor__';
const encerrada=m=>['Concluído','Cancelado'].includes(m.status);
export const metaNoSetor=(m,setor)=>!setor||(setor===SEM_SETOR_META?!m.setor:m.setor===setor);
export const colunaMetasAtivas=(metas,usuario)=>metas.filter(m=>!encerrada(m)&&responsavelMeta(m,usuario)).sort((a,b)=>(a.ordemColuna??999)-(b.ordemColuna??999)||(a.prazo||'').localeCompare(b.prazo||''));
export function colunasMetasAtivas(equipe,metas,incluirVazias=false){
 const colunas=equipe.map(usuario=>({usuario,metas:colunaMetasAtivas(metas,usuario)}));
 return incluirVazias?colunas:colunas.filter(c=>c.metas.length);
}
