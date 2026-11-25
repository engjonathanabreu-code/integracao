// Melhorias derivadas do histórico de uso das Metas (onda 1 do pente fino).
// Só regras puras: a tela chama estas funções e continua dona da gravação.
import {diaCivilEvento} from './calendario-ocorrencias.js';

const somarDias=(dia,n)=>{const d=new Date(`${dia}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

// USO-M1 — o prazo médio dado era de 8 dias e o tempo real de 11 a 14.
// A meta nova já abre com duas semanas; quem cria continua livre para trocar.
export const PRAZO_SUGERIDO_DIAS=14;
export function prazoSugeridoMeta(agora=new Date()){
 const hoje=diaCivilEvento(agora);
 return hoje?somarDias(hoje,PRAZO_SUGERIDO_DIAS):'';
}
