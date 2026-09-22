import {tokenTempoReal} from './dados-compartilhados.js';
import {normFinanceiro as norm} from './financeiro-regras.js';
export function dataImportada(v){if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v??'').trim(),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);const d=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s.slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d?d:'';}
export function numeroImportado(v){if(typeof v==='number')return v;const s=String(v??'').replace(/R\$|\s/g,'');return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);}
export function linhasPlanilha(rows){if(!rows.length)throw Error('Planilha vazia.');const h=rows[0].map(norm);const col=(...a)=>a.map(norm).map(n=>h.indexOf(n)).find(n=>n>=0)??-1;
 const ids={pagador:col('nome','cliente','pagador'),documento:col('documento','codigo_processo','codigo','contrato'),cpf_cnpj:col('cpf_cnpj','cpf','cnpj'),nosso_numero:col('nosso_numero'),vencimento:col('parcela_vencimento','vencimento'),pagamento:col('data_pagamento','pagamento'),valor_liquidado:col('valor_pago','valor_liquidado'),linha_digitavel:col('linha_digitavel')};
 if(ids.vencimento<0||ids.valor_liquidado<0||ids.pagamento<0)throw Error('Use as colunas vencimento, valor_pago e data_pagamento, além de nome, CPF ou código do cliente.');
 return rows.slice(1).filter(row=>row.some(v=>v!==''&&v!=null)).map(row=>{const e=Object.fromEntries(Object.entries(ids).map(([k,i])=>[k,i<0?'':row[i]??'']));e.vencimento=dataImportada(e.vencimento);e.pagamento=dataImportada(e.pagamento);e.valor_liquidado=numeroImportado(e.valor_liquidado);return e;});}
export async function lerDocumentoFinanceiro(file,modo){
 if(file.size>3*1024*1024)throw Error('Envie um arquivo de até 3 MB. Divida documentos maiores em partes.');
 if(/\.(csv|xlsx|xls)$/i.test(file.name)&&modo==='pagamentos'){const XLSX=await import('xlsx'),wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});return linhasPlanilha(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''}));}
 if(!/\.pdf$/i.test(file.name))throw Error('Envie um PDF legível ou, para pagamentos, uma planilha CSV/Excel.');
 if(modo==='pagamentos'){try{const linhas=await parsePdfLocally(file);if(linhas.length)return linhas;}catch{/* Unrecognized layouts are reviewed through AI. */}}
 const fileData=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));r.onload=()=>resolve(r.result);r.readAsDataURL(file);});
 const token=await tokenTempoReal();if(!token)throw Error('Entre novamente para analisar o documento.');
 const r=await fetch('/api/financeiro-documentos',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({file:fileData,fileName:file.name,modo}),signal:AbortSignal.timeout(120000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||'Não foi possível analisar o documento. Tente novamente.');return d.entries||[];
}

const REPORT_ROW_RE=/^(INTERNET|COMPE)\s+(\d+)\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})(.*?)(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)([\d.,]+)\s+([\d.,]+)\s+(\S+?)([\d.,]+)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})([\d.,]+)\s+(.*?)(\d{2}\/\d{2}\/\d{4})([\d.,]+)$/;
function cleanReportRow(l){
 return l.replace(/MotivoVencimentoNome[\s\S]*?Vlr\.Boleto/,'').replace(/TOTAL[\s\S]*?Boleto\(s\)/,'').replace(/Convênio:[\s\S]*$/,'').trim();
}
async function extractReportRows(pdf){
 const rows=[];
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p);
  const tc=await page.getTextContent();
  let cur=null;
  for(const it of tc.items){
   const s=it.str;
   if(s.trim()==='INTERNET'||s.trim()==='COMPE'){if(cur)rows.push(cur.join(''));cur=[s]}
   else if(cur)cur.push(s);
  }
  if(cur)rows.push(cur.join(''));
 }
 return rows;
}
async function parsePdfLocally(file){
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
 const buf=await file.arrayBuffer(),pdf=await pdfjs.getDocument({data:buf}).promise;
 const rawRows=await extractReportRows(pdf);
 const out=[];
 for(const raw of rawRows){
  const l=cleanReportRow(raw);
  if(!l.startsWith('COMPE'))continue;
  const m=l.match(REPORT_ROW_RE);
  if(!m)continue;
  out.push({
   documento:m[2],
   nosso_numero:null,
   cpf_cnpj:null,
   pagador:m[5].trim(),
   vencimento:dataImportada(m[4]),
   valor_nominal:numeroImportado(m[13]),
   valor_liquidado:numeroImportado(m[13]),
   pagamento:dataImportada(m[17])
  });
 }
 await pdf.destroy();return out;
}
