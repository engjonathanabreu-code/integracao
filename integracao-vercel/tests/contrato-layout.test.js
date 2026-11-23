import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import JSZip from 'jszip';
import {gerarDocx} from '../src/documento-docx.js';
import {gerarPdf} from '../src/documento-pdf.js';
import {analisarDocumento,formatoDocumento,perfilDocumento,documentoHtml} from '../src/documento-formato.js';
import {timbrado} from './documentos-comerciais.fixture.js';
import {contratoSintetico} from './contrato-layout.fixture.js';
const parse=html=>parseHTML('<html><body>'+html+'</body></html>').document;
test('perfil compacto explícito preserva texto, outros documentos e margens do timbre',()=>{
 const html=contratoSintetico(),plain=html.replaceAll('data-documento="contrato"','');
 assert.equal(perfilDocumento(html),'contrato');
 const a=analisarDocumento(html,{parse}),b=analisarDocumento(plain,{parse});
 assert.deepEqual(a.map(x=>x.runs),b.map(x=>x.runs));
 assert.ok(a.every(x=>x.size>=11));assert.ok(b.every(x=>x.size===12));
 assert.equal(formatoDocumento(timbrado,perfilDocumento(html)).esquerda,20);
 assert.equal(formatoDocumento(timbrado).esquerda,30);
 assert.equal(formatoDocumento(timbrado,perfilDocumento(html)).topo,formatoDocumento(timbrado).topo);
 assert.match(documentoHtml(html,'Contrato',timbrado),/padding:[0-9.]+mm 20mm [0-9.]+mm 20mm/);
 const sig=a.findIndex(x=>x.runs?.some(r=>r.text?.startsWith('__________')));
 assert.ok(a[sig-1].keepNext);assert.ok(a[sig].keepTogether);assert.ok(a[sig].keepNext);
});
test('contratos completos: PDF até 3 páginas individual e 4 casal; Word nativo preserva todas as cláusulas',async()=>{
 for(const casal of [false,true]){
  const html=contratoSintetico(casal),pdf=Buffer.from(await(await gerarPdf(html,'Contrato QA',timbrado,{parse})).arrayBuffer());
  const pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
  assert.ok(pages<= (casal?4:3),`${casal?'casal':'individual'}: ${pages} páginas`);
  const zip=await JSZip.loadAsync(await(await gerarDocx(html,'Contrato QA',timbrado,{parse})).arrayBuffer());
  const xml=await zip.file('word/document.xml').async('string');
  assert.match(xml,/w:lineRule="exact"/);assert.match(xml,/w:sz w:val="22"/);
  const text=parse(xml.replace(/<[^>]+>/g,'')).body.textContent.replace(/\s/g,'');
  for(const b of analisarDocumento(html,{parse}))for(const r of b.runs||[])assert.ok(text.includes(r.text.replace(/\s/g,'')),r.text);
 }
});
