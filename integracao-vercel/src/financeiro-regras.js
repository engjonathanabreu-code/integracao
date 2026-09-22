export const dinheiro=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const dataFinanceira=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
export const valorReal=p=>Math.round((Number(p.valor_previsto||0)+Number(p.juros||0)+Number(p.multa||0))*100)/100;
export const normFinanceiro=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function validarLinhaBoleto(valor){
 const d=String(valor||'').replace(/\D/g,'');
 const mod10=s=>{let soma=0,p=2;for(let i=s.length-1;i>=0;i--){const x=Number(s[i])*p;soma+=Math.floor(x/10)+x%10;p=p===2?1:2;}return (10-soma%10)%10;};
 const mod11=s=>{let soma=0,p=2;for(let i=s.length-1;i>=0;i--){soma+=Number(s[i])*p;p=p===9?2:p+1;}const dv=11-soma%11;return dv===0||dv===10||dv===11?1:dv;};
 if(d.length!==47)return false;
 if(mod10(d.slice(0,9))!==Number(d[9])||mod10(d.slice(10,20))!==Number(d[20])||mod10(d.slice(21,31))!==Number(d[31]))return false;
 const barcode=d.slice(0,4)+d[32]+d.slice(33)+d.slice(4,9)+d.slice(10,20)+d.slice(21,31);
 return mod11(barcode.slice(0,4)+barcode.slice(5))===Number(barcode[4]);
}
export function conciliarFinanceiro(entradas,clientes,parcelas,modo){
 const usados=new Set();return entradas.map(e=>{
 const venc=String(e.vencimento||'').slice(0,10),doc=normFinanceiro(e.documento),cpf=normFinanceiro(e.cpf_cnpj),nome=normFinanceiro(e.pagador),nn=normFinanceiro(e.nosso_numero);
 let candidatos=parcelas.filter(p=>p.ativo!==false&&p.status!=='Cancelado'&&p.vencimento===venc);
 const forte=candidatos.filter(p=>(nn&&normFinanceiro(p.nosso_numero)===nn)||(doc&&normFinanceiro(p.documento)===doc));
 if(forte.length)candidatos=forte;else{let cs=clientes.filter(c=>(cpf&&normFinanceiro(c.cpf_cnpj)===cpf)||(doc&&normFinanceiro(c.codigo)===doc));if(!cs.length&&nome)cs=clientes.filter(c=>normFinanceiro(c.nome)===nome);const ids=new Set(cs.map(c=>c.id));candidatos=candidatos.filter(p=>ids.has(p.cliente_id));}
 let motivo=candidatos.length===1?'':candidatos.length?'Mais de uma parcela corresponde. Confira manualmente.':'Não foi encontrada uma parcela com a mesma identidade e vencimento.';
 const p=candidatos.length===1?candidatos[0]:null;
 if(p&&usados.has(p.id))motivo='Parcela repetida no arquivo.';
 if(modo==='boletos'&&!validarLinhaBoleto(e.linha_digitavel))motivo='Linha digitável não reconhecida ou dígitos verificadores inválidos. Confira manualmente.';
 if(modo==='pagamentos'&&(!/^\d{4}-\d{2}-\d{2}$/.test(e.pagamento||'')||!Number.isFinite(Number(e.valor_liquidado))||Number(e.valor_liquidado)<=0))motivo='Confira a data e o valor pago no documento.';
 if(p&&!motivo)usados.add(p.id);
 const dados=modo==='boletos'?{linha_digitavel:String(e.linha_digitavel||'').replace(/\D/g,'')}:{status:'Pago',pago_em:e.pagamento,valor_liquidado:Number(e.valor_liquidado)};
 return {entrada:e,parcela:p,cliente:p?clientes.find(c=>c.id===p.cliente_id):null,motivo,dados,selecionado:false};
 });
}
