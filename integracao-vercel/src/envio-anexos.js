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

// SYNC-M2: anexos que já subiram nesta conta/aparelho. O caminho no Storage é
// imutável e endereçado pelo conteúdo (conta/meta/anexo-SHA256), então o mesmo
// caminho é sempre o mesmo arquivo. Uma nova tentativa da mesma intenção pula
// o reenvio dos bytes; a gravação da linha e a releitura continuam iguais.
// Só o caminho e o horário são guardados (nunca o conteúdo), por 24 h.
const CHAVE='integracao-anexos-enviados-v1',VALIDADE_MS=24*60*60*1000,LIMITE=200;
const memoria=new Map();
const padrao=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const lerGuardados=armazenamento=>{
 try{const v=JSON.parse(armazenamento?.getItem(CHAVE)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}
};
const valido=(em,agora)=>Number.isFinite(em)&&agora-em>=0&&agora-em<VALIDADE_MS;
export function anexoJaEnviado(caminho,{agora=Date.now(),armazenamento=padrao()}={}){
 if(typeof caminho!=='string'||!caminho)return false;
 return valido(memoria.get(caminho),agora)||valido(lerGuardados(armazenamento)[caminho],agora);
}
// Falha ao guardar o marcador nunca falha o envio: no pior caso o arquivo sobe de novo.
export function registrarAnexoEnviado(caminho,{agora=Date.now(),armazenamento=padrao()}={}){
 if(typeof caminho!=='string'||!caminho)return;
 memoria.set(caminho,agora);
 for(const [k,em] of memoria)if(!valido(em,agora))memoria.delete(k);
 try{
  const todos=Object.entries({...lerGuardados(armazenamento),[caminho]:agora}).filter(([,em])=>valido(em,agora)).sort((a,b)=>b[1]-a[1]).slice(0,LIMITE);
  armazenamento?.setItem(CHAVE,JSON.stringify(Object.fromEntries(todos)));
 }catch{/* marcador é só otimização */}
}
export function esquecerAnexosEnviados({armazenamento=padrao()}={}){memoria.clear();try{armazenamento?.removeItem(CHAVE);}catch{/* idem */}}
