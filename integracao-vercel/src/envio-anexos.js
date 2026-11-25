// Envio de anexos de Metas para o Storage (chamado por prepararArquivos).
// SYNC-M1: tempo-limite proporcional ao tamanho. Um envio parado deixa de
// segurar a fila indefinidamente; o estouro é uma falha de transporte
// (TimeoutError → categoria `transitoria`), repetida com espera crescente.
const BASE_MS=60000,BYTES_POR_MS=50,TETO_MS=10*60*1000;
// 60 s fixos + 1 ms a cada 50 bytes (piso de ~400 kbit/s): 25 MB ≈ 9,7 min.
export function tempoLimiteEnvioMs(bytes){
 const n=Number(bytes);
 return Math.min(TETO_MS,BASE_MS+Math.ceil((Number.isFinite(n)&&n>0?n:0)/BYTES_POR_MS));
}
