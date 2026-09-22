import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';import JSZip from 'jszip';
import {gerarDocx} from '../src/documento-docx.js';import {gerarPdf} from '../src/documento-pdf.js';import {formatoDocumento,analisarDocumento} from '../src/documento-formato.js';import {documentos,timbrado} from './documentos-comerciais.fixture.js';
const parse=html=>parseHTML('<html><body>'+html+'</body></html>').document;
test('renda: margens, 12pt, entrelinhas 1,5 e assinatura centralizada sem grade',async()=>{
 const blob=await gerarDocx(documentos.dec_renda,'Renda',timbrado,{parse}),zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/w:line="360"/);assert.match(xml,/w:sz w:val="24"/);assert.match(xml,/w:firstLine="709"/);assert.match(xml,/w:jc w:val="center"/);assert.match(xml,/w:top w:val="single"/);assert.match(xml,/w:insideH w:val="none"/);assert.match(xml,/w:keepNext/);assert.doesNotMatch(xml,/w:sz w:val="28"/);
 const f=formatoDocumento(timbrado);assert.equal(f.esquerda,30);assert.equal(f.direita,20);assert.ok(f.topo<31);assert.ok(f.base<25);
 const assinatura=analisarDocumento(documentos.dec_renda,{parse}).find(b=>b.type==='table');assert.ok(assinatura.assinatura);assert.equal(assinatura.rows[0].cells[0].blocks[0].alignment,'center');
});
test('todos os modelos comerciais produzem Word nativo e PDF',async()=>{for(const [tipo,html] of Object.entries(documentos)){
 assert.ok(!html.includes('{{'),tipo+' sem marcadores pendentes');
 const word=await gerarDocx(html,tipo,timbrado,{parse}),zip=await JSZip.loadAsync(await word.arrayBuffer());assert.ok(zip.file('word/document.xml'));
 const pdf=await gerarPdf(html,tipo,timbrado,{parse});assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
}});
test('PDF multipágina, sem timbrado, com tabela e texto longo',async()=>{
 const html='<h1>Documento extenso</h1>'+Array.from({length:75},(_,i)=>`<p>Parágrafo ${i}: ${'Informação do cliente para verificar a paginação. '.repeat(8)}</p>`).join('');
 const pdf=Buffer.from(await(await gerarPdf(html,'Longo',{ativo:false},{parse})).arrayBuffer()).toString('latin1');assert.ok((pdf.match(/\/Type \/Page\b/g)||[]).length>5);
 const sem=formatoDocumento({ativo:false,imagens:timbrado.imagens});assert.equal(Object.keys(sem.imagens).length,0);assert.equal(sem.topo,30);
});
test('erros de timbrado são explícitos nos dois formatos',async()=>{for(const gerar of [gerarDocx,gerarPdf])await assert.rejects(()=>gerar('<p>Texto</p>','Teste',{cabecalho:{chave:'não carregado'},imagens:{}},{parse}),/timbrado/);});
test('preserva negrito, marca-texto, sobrescrito, listas, tabelas mescladas e timbrado desativado no Word',async()=>{
 const html='<h1>Título</h1><p><b>Área</b>: 200 m<sup>2</sup> <mark>revisar</mark></p><ol start="3"><li>Terceiro item</li></ol><table><tr><th colspan="2">Dados</th></tr><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>';
 const zip=await JSZip.loadAsync(await(await gerarDocx(html,'Teste',{ativo:false,imagens:timbrado.imagens},{parse})).arrayBuffer());const xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/w:pStyle w:val="Heading1"/);assert.match(xml,/w:vertAlign w:val="superscript"/);assert.match(xml,/w:highlight w:val="yellow"/);assert.match(xml,/3\. /);assert.match(xml,/w:gridSpan w:val="2"/);assert.match(xml,/w:vMerge/);assert.equal(Object.keys(zip.files).filter(k=>k.startsWith('word/media/')&&!zip.files[k].dir).length,0);
});
