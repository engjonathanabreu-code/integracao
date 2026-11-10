// Read-only synthetic reproduction; this is a diagnostic, not an acceptance success.
import {filaRascunho} from '../src/fila-rascunho.js';
let liberar,entrou;const bloqueio=new Promise(r=>liberar=r),entrada=new Promise(r=>entrou=r),map=new Map();
const storage={set:async(k,v)=>{if(k==='fixture-conta'&&v==='snapshot-antigo'){entrou();await bloqueio;}map.set(k,v);}};
const abaA=filaRascunho(storage),abaB=filaRascunho(storage);
const antiga=abaA('fixture-conta','snapshot-antigo','fixture');await entrada;
await abaB('fixture-conta','snapshot-novo-com-intencao','fixture');liberar();await antiga;
console.log(JSON.stringify({cenario:'duas instancias na mesma chave',sobreposicaoReproduzida:map.get('fixture-conta')==='snapshot-antigo',criterioAceitacaoAtendido:false,dadosReaisUsados:false}));
