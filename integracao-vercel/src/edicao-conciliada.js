import {conciliarEdicoes,erroConcorrencia} from './concorrencia.js';
const igual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Each retry reads a new baseline and still uses a database CAS/row lock.
// A choice never authorizes overwriting a value changed since it was shown.
export async function editarConciliado({anterior,local,ler,gravar,sempreGravar=false},escolhas={},mostrado=null){
 for(let tentativa=0;tentativa<3;tentativa++){
  const remoto=await ler();
  if(!remoto)throw new Error('Registro indisponível ou sem permissão.');
  const conciliado=conciliarEdicoes(anterior,local,remoto,mostrado&&igual(mostrado,remoto)?escolhas:{});
  if(conciliado.conflitos.length){
   const e=new Error('Escolha os valores diferentes para continuar.');e.code='PT409';e.conflitos=conciliado.conflitos;
   e.resolver=opcoes=>editarConciliado({anterior,local,ler,gravar,sempreGravar},opcoes,remoto);throw e;
  }
  const dados=Object.fromEntries(Object.keys(local).filter(k=>!igual(conciliado.dados[k],remoto[k])).map(k=>[k,conciliado.dados[k]]));
  if(!Object.keys(dados).length&&!sempreGravar)return remoto;
  try{return await gravar(dados,remoto);}catch(e){if(!erroConcorrencia(e)||tentativa===2)throw e;}
 }
}
