// Marcações duráveis por conta. O mesmo identificador acompanha todas as tentativas.
export const chavePonto=id=>`integracao-ponto-local-v1:${id}`;
export function lerPontoLocal(id,storage=localStorage){const raw=storage.getItem(chavePonto(id));if(!raw)return {estado:null,fila:[]};const r=JSON.parse(raw);if(!Array.isArray(r.fila))throw Error('Não foi possível ler as marcações guardadas. Não limpe os dados do navegador.');return r;}
export function gravarPontoLocal(id,dados,storage=localStorage){const texto=JSON.stringify(dados);storage.setItem(chavePonto(id),texto);if(storage.getItem(chavePonto(id))!==texto)throw Error('Não foi possível guardar a marcação neste aparelho.');}
export const diaLocalPonto=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
export function visaoPontoLocal(r,agora=new Date().toISOString()){
 const dia=diaLocalPonto(agora),base=r.estado?.hoje?.dia===dia?r.estado.hoje.batidas:[];
 const pendentes=r.fila.filter(b=>diaLocalPonto(b.ocorrido_em)===dia);
 // Um envio confirmado pode ter falhado apenas ao remover o rascunho: deduplicação visual pelo horário.
 const batidas=[...base,...pendentes.map(b=>b.ocorrido_em)].filter((b,i,a)=>a.indexOf(b)===i).sort();
 return {batidas,proximo:batidas.length%2?'saida':'entrada'};
}
export function enfileirarPonto(r,{agora=new Date().toISOString(),pedido=crypto.randomUUID(),offline=false}={}){
 if(r.estado?.jornada?.vinculo!=='CLT')throw Error('Conecte-se para carregar seu vínculo CLT antes de usar o ponto offline.');
 const v=visaoPontoLocal(r,agora),ultima=[...v.batidas,...r.fila.map(b=>b.ocorrido_em)].sort().at(-1);
 if(ultima&&new Date(agora)-new Date(ultima)<30000)throw Error('Aguarde 30 segundos após a última marcação. Confira também o relógio do aparelho.');
 return {...r,fila:[...r.fila,{pedido,tipo:v.proximo,ocorrido_em:agora,offline}]};
}
export async function enviarFilaPonto(r,enviar,salvar){
 let atual=r;
 for(const b of r.fila){
  const recibo=await enviar(b);
  if(recibo.id!==b.pedido)throw Error('O servidor não confirmou esta marcação. Ela continua no aparelho.');
  const estado=atual.estado?structuredClone(atual.estado):null;
  if(estado?.hoje?.dia===diaLocalPonto(recibo.ocorrido_em)&&!estado.hoje.batidas.includes(recibo.ocorrido_em))estado.hoje.batidas.push(recibo.ocorrido_em);
  atual={...atual,estado,fila:atual.fila.filter(x=>x.pedido!==b.pedido)};
  await salvar(atual);
 }
 return atual;
}
