const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
export const cargaEmHoras=minutos=>`${Math.floor(minutos/60).toString().padStart(2,'0')}:${(minutos%60).toString().padStart(2,'0')}`;
export function cargaEmMinutos(valor){
 if(!/^(?:[01]?\d|2[0-4]):[0-5]\d$/.test(String(valor)))throw new Error('Informe a carga diária no formato HH:MM, por exemplo 08:00.');
 const [h,m]=valor.split(':').map(Number),carga=h*60+m;
 if(carga<=0||carga>1440)throw new Error('Cada dia marcado precisa de uma carga maior que zero e de até 24 horas.');
 return carga;
}
export function dadosJornada(form){
 if(!form.dias.length)throw new Error('Selecione ao menos um dia da semana.');
 const comum={vinculo:form.vinculo,vigencia:form.vigencia,dias:form.dias,flexivel:form.vinculo==='CLT'&&form.flexivel};
 if(comum.flexivel)return {...comum,cargas:dias.map((_,i)=>form.dias.includes(i)?cargaEmMinutos(form.cargas[i]):0)};
 const intervalo=Number(form.intervalo),[eh,em]=form.entrada.split(':').map(Number),[sh,sm]=form.saida.split(':').map(Number),duracao=(sh-eh)*60+sm-em;
 if(!Number.isInteger(intervalo)||intervalo<0||!Number.isFinite(duracao)||duracao<=intervalo)throw new Error('Informe uma saída após a entrada e um intervalo menor que a jornada, no mesmo dia.');
 return {...comum,entrada:form.entrada,saida:form.saida,intervalo};
}
export function resumoJornada(j){
 return j.flexivel?`Horário flexível · ${j.dias.map(i=>`${dias[i]} ${cargaEmHoras(j.cargas[i])}`).join(' · ')}`:`${j.entrada.slice(0,5)}–${j.saida.slice(0,5)} · intervalo ${j.intervalo} min`;
}
