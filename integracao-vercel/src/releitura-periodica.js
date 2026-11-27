// SYNC-M5: com o tempo real conectado, as mudanças chegam por aviso de revisão
// e cada (re)conexão já pede uma leitura completa. A releitura periódica (tick
// de 120 s) e a de troca de janela só são necessárias quando o tempo real não
// está conectado, quando ainda não houve leitura completa depois da conexão
// atual, ou como rede de segurança depois de TETO_SEM_RELEITURA_MS (o tempo
// real não garante entrega). O teto fica abaixo da validade da base usada pela
// leitura por escopo (10 min), para que os salvamentos continuem lendo só o
// registro alterado.
export const TETO_SEM_RELEITURA_MS=7*60*1000;
export function dispensaReleituraCompleta({tempoReal,conectadoDesde=0,ultimaCompletaEm=0,agora=Date.now()}={}){
 if(tempoReal!=='conectado')return false;
 if(!(ultimaCompletaEm>0)||!(conectadoDesde>0)||ultimaCompletaEm<conectadoDesde)return false;
 const idade=agora-ultimaCompletaEm;
 // Relógio que andou para trás não comprova base recente.
 return idade>=0&&idade<TETO_SEM_RELEITURA_MS;
}
