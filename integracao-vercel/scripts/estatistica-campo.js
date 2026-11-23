export function percentil(valores,p){
 if(!valores.length||valores.some(v=>!Number.isFinite(v))||!(p>0&&p<=1))throw Error('Amostras ou percentil inválidos.');
 const a=[...valores].sort((x,y)=>x-y);return a[Math.ceil(a.length*p)-1];
}
export function resumoCampo(amostras,chave){
 const a=amostras.map(s=>s[chave]);
 return {n:a.length,p50:percentil(a,.5),p95:percentil(a,.95),media:a.reduce((s,v)=>s+v,0)/a.length,max:Math.max(...a)};
}
// Preserve each whole ABBA/BAAB block, including temporal counterbalancing.
// Samples or adjacent pairs are not independent experimental repetitions.
export function compararCampo(rodadas,{repeticoes=5000,seed=20261123}={}){
 if(rodadas.length<8||rodadas.length%4)throw Error('Blocos balanceados insuficientes.');
 const pares=[];
 for(let i=0;i<rodadas.length;i+=2){
  const par=rodadas.slice(i,i+2);
  if(new Set(par.map(r=>r.versao)).size!==2||!par.every(r=>['base','pr'].includes(r.versao)&&r.samples.length>0&&r.samples.every(s=>s.status==='ok')))throw Error('Par incompleto ou com falha/censura.');
  pares.push(par);
 }
 const blocos=[];
 for(let i=0;i<rodadas.length;i+=4){
  const bloco=rodadas.slice(i,i+4),ordem=bloco.map(r=>r.versao).join(',');
  if(!['base,pr,pr,base','pr,base,base,pr'].includes(ordem))throw Error('Bloco não contrabalanceado.');
  blocos.push(bloco);
 }
 const todas=versao=>rodadas.filter(r=>r.versao===versao).flatMap(r=>r.samples);
 let estado=seed>>>0;const random=()=>{estado^=estado<<13;estado^=estado>>>17;estado^=estado<<5;return (estado>>>0)/4294967296;};
 const saida={blocos:blocos.length,pares:pares.length,repeticoes,seed,metodo:'bootstrap de blocos inteiros ABBA/BAAB; intervalo percentil estimado de 95%',endpoints:{}};
 const chaves=['durableMs','uiMs',...(['legacyPollingMs','pollAfterUiMs'].filter(k=>rodadas.every(r=>r.samples.every(s=>Number.isFinite(s[k])))))];
 for(const chave of chaves){
  const base=resumoCampo(todas('base'),chave),pr=resumoCampo(todas('pr'),chave),deltas=[];
  for(let n=0;n<repeticoes;n++){
   const sorteadas=Array.from({length:blocos.length},()=>blocos[Math.floor(random()*blocos.length)]).flat();
   const a=sorteadas.filter(r=>r.versao==='base').flatMap(r=>r.samples.map(s=>s[chave]));
   const b=sorteadas.filter(r=>r.versao==='pr').flatMap(r=>r.samples.map(s=>s[chave]));
   deltas.push(percentil(b,.95)-percentil(a,.95));
  }
  saida.endpoints[chave]={base,pr,deltaP95:pr.p95-base.p95,intervalo95:[percentil(deltas,.025),percentil(deltas,.975)],
   deltasPorBloco:blocos.map(bloco=>{const a=bloco.filter(r=>r.versao==='base').flatMap(r=>r.samples),b=bloco.filter(r=>r.versao==='pr').flatMap(r=>r.samples);return resumoCampo(b,chave).p95-resumoCampo(a,chave).p95;}),
   deltasPorPar:pares.map(par=>{const a=par.find(r=>r.versao==='base'),b=par.find(r=>r.versao==='pr');return resumoCampo(b.samples,chave).p95-resumoCampo(a.samples,chave).p95;})};
 }
 return saida;
}
