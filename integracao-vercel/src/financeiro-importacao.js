import {tokenTempoReal} from './dados-compartilhados.js';
import {normFinanceiro as norm} from './financeiro-regras.js';
export function dataImportada(v){if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v??'').trim(),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);const d=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s.slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d?d:'';}
export function numeroImportado(v){if(typeof v==='number')return v;const s=String(v??'').replace(/R\$|\s/g,'');return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);}
export function linhasPlanilha(rows){if(!rows.length)throw Error('Planilha vazia.');const h=rows[0].map(norm);const col=(...a)=>a.map(norm).map(n=>h.indexOf(n)).find(n=>n>=0)??-1;
 const ids={pagador:col('nome','cliente','pagador'),documento:col('documento'),codigo_processo:col('codigo_processo','codigo','contrato'),cpf_cnpj:col('cpf_cnpj','cpf','cnpj'),nosso_numero:col('nosso_numero'),vencimento:col('parcela_vencimento','vencimento'),pagamento:col('data_pagamento','pagamento'),desconto:col('desconto','valor_desconto'),abatimento:col('abatimento','valor_abatimento'),valor_liquidado:col('valor_pago','valor_liquidado'),linha_digitavel:col('linha_digitavel')};
 if(ids.vencimento<0||ids.valor_liquidado<0||ids.pagamento<0)throw Error('Use as colunas vencimento, valor_pago e data_pagamento, além de nome, CPF ou código do cliente.');
 return rows.slice(1).filter(row=>row.some(v=>v!==''&&v!=null)).map(row=>{const e=Object.fromEntries(Object.entries(ids).map(([k,i])=>[k,i<0?'':row[i]??'']));e.vencimento=dataImportada(e.vencimento);e.pagamento=dataImportada(e.pagamento);e.valor_liquidado=numeroImportado(e.valor_liquidado);return e;});}
export function itemPagamentoRelatorio(entrada){
 const centavos=valor=>{
  if(valor===null||valor===undefined||valor==='')return null;
  const quantia=numeroImportado(valor),inteiro=Math.round(quantia*100);
  return Number.isSafeInteger(inteiro)&&Math.abs(quantia*100-inteiro)<1e-7?inteiro:null;
 };
 const descontos=[entrada.desconto??entrada.valor_desconto,entrada.abatimento].filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(centavos);
 return {
  documento:entrada.documento||null,nosso_numero:entrada.nosso_numero||null,
  codigo_processo:entrada.codigo_processo||null,cpf_cnpj:entrada.cpf_cnpj||null,
  vencimento:dataImportada(entrada.vencimento),pagamento:dataImportada(entrada.pagamento),
  valor_centavos:centavos(entrada.valor_liquidado),
  ...(descontos.length?{desconto_centavos:descontos.every(v=>v!==null&&v>=0)?descontos.reduce((total,v)=>total+v,0):'inválido'}:{})
 };
}
export async function argumentosRelatorio(arquivo,entradas){
 const hash=await crypto.subtle.digest('SHA-256',await arquivo.arrayBuffer());
 return {p_arquivo:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),p_itens:entradas.map(itemPagamentoRelatorio)};
}
export async function lerDocumentoFinanceiro(file,modo){
 if(file.size>3*1024*1024)throw Error('Envie um arquivo de até 3 MB. Divida documentos maiores em partes.');
 if(/\.(csv|xlsx|xls)$/i.test(file.name)&&modo==='pagamentos'){
  const bytes=await file.arrayBuffer(), excel=/\.xlsx?$/i.test(file.name);
  const signature=new Uint8Array(bytes,0,Math.min(8,bytes.byteLength));
  const zip=signature[0]===80&&signature[1]===75&&signature[2]===3&&signature[3]===4;
  const cfb=signature[0]===0xd0&&signature[1]===0xcf&&signature[2]===0x11&&signature[3]===0xe0;
  const biff=signature[0]===9&&[0,2,4,8].includes(signature[1]);
  if(!bytes.byteLength||excel&&(/\.xlsx$/i.test(file.name)?!zip:!cfb&&!biff))throw Error('O conteúdo não corresponde ao formato da planilha.');
  const BOM=(signature[0]===0xff&&signature[1]===0xfe)||(signature[0]===0xfe&&signature[1]===0xff);
  if(!excel&&!BOM&&!/[;,\t]/.test(new TextDecoder().decode(bytes.slice(0,4096))))throw Error('O CSV não possui cabeçalho delimitado.');
  const XLSX=await import('xlsx'),wb=XLSX.read(bytes,{type:'array',cellDates:true,raw:true,sheetRows:502});
  const sheet=wb.Sheets[wb.SheetNames[0]];
  if(!sheet?.['!ref'])throw Error('Planilha vazia.');
  const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
  if(range.e.r-range.s.r>500||range.e.c-range.s.c>127)throw Error('Use uma planilha com até 500 registros e 128 colunas.');
  return linhasPlanilha(XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''}));
 }
 if(!/\.pdf$/i.test(file.name))throw Error('Envie um PDF legível ou, para pagamentos, uma planilha CSV/Excel.');
 const fileData=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));r.onload=()=>resolve(r.result);r.readAsDataURL(file);});
 const token=await tokenTempoReal();if(!token)throw Error('Entre novamente para analisar o documento.');
 const r=await fetch('/api/financeiro-documentos',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({file:fileData,fileName:file.name,modo}),signal:AbortSignal.timeout(120000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'Não foi possível analisar o documento. Tente novamente.');return d.entries||[];
}
