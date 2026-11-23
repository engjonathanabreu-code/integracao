// Reproducible local visual QA. No login, production data, upload or publication.
// Usage: node scripts/validar-layout-contrato.mjs /tmp/contrato-layout-qa
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseHTML} from 'linkedom';
import {analisarDocumento} from '../src/documento-formato.js';
import {gerarDocx} from '../src/documento-docx.js';
import {gerarPdf} from '../src/documento-pdf.js';
import {contratoSintetico} from '../tests/contrato-layout.fixture.js';
import {timbrado} from '../tests/documentos-comerciais.fixture.js';
const out=path.resolve(process.argv[2]||'/tmp/contrato-layout-qa');
const parse=html=>parseHTML('<html><body>'+html+'</body></html>').document;
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'word'),{recursive:true});
for(const casal of [false,true]){
 const nome=casal?'casal':'individual',html=contratoSintetico(casal);
 fs.writeFileSync(path.join(out,nome+'.html'),html);
 for(const [ext,gen] of [['docx',gerarDocx],['pdf',gerarPdf]])fs.writeFileSync(path.join(out,nome+'.'+ext),Buffer.from(await(await gen(html,'Contrato sintético '+nome,timbrado,{parse})).arrayBuffer()));
 execFileSync('soffice',['-env:UserInstallation=file://'+path.join(out,'lo-profile'),'--headless','--convert-to','pdf','--outdir',path.join(out,'word'),path.join(out,nome+'.docx')],{stdio:'pipe'});
 for(const file of [path.join(out,nome+'.pdf'),path.join(out,'word',nome+'.pdf')]){
  const info=execFileSync('pdfinfo',[file],{encoding:'utf8'}),pages=Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
  console.log(file+': '+pages+' páginas');
  const normalize=s=>s.normalize('NFKC').replace(/\s/g,'');
  const extracted=normalize(execFileSync('pdftotext',['-layout','-nopgbrk',file,'-'],{encoding:'utf8'}).replace(/^\s*\d+\s*$/gm,''));
  for(const b of analisarDocumento(html,{parse}))for(const r of b.runs||[])if(!extracted.includes(normalize(r.text||'')))throw new Error('Texto ausente na renderização: '+file+' '+r.text);
  if(!pages||pages>(casal?4:3))throw new Error('Limite de páginas excedido: '+file);
 }
}
