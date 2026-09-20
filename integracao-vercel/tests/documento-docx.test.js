import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import JSZip from 'jszip';
import {gerarDocx} from '../src/documento-docx.js';
import {timbradoPadrao,imagemPadrao} from '../src/timbrado.js';
const parse=html=>parseHTML('<html><body>'+html+'</body></html>').document;
test('Word nativo contém A4, margens de relatório, timbre incorporado e paginação',async()=>{
 const t=timbradoPadrao();t.imagens=Object.fromEntries(['cabecalho','rodape'].map(k=>[k,imagemPadrao(t[k],k)]));
 const blob=await gerarDocx('<h1>Projeto de Regularização Fundiária</h1><p>Município <b>teste</b></p><table><tr><th>Unidade</th><th>Área</th></tr><tr><td>001</td><td>200 m²</td></tr></table>','PRF',t,{parse});
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/w:w="11906"/);assert.match(xml,/w:left="1701"/);assert.match(xml,/w:right="1134"/);assert.match(xml,/Município/);assert.match(xml,/w:tbl/);assert.match(xml,/w:tblHeader/);
 assert.ok(zip.file('word/header1.xml'));assert.ok(zip.file('word/footer1.xml'));assert.ok(Object.keys(zip.files).filter(k=>k.startsWith('word/media/')&&!zip.files[k].dir).length===2);
 const header=await zip.file('word/header1.xml').async('string'),footer=await zip.file('word/footer1.xml').async('string');assert.match(footer,/PAGE/);assert.notEqual(header.match(/wp:docPr id="(\d+)"/)[1],footer.match(/wp:docPr id="(\d+)"/)[1]);
 // Arte na largura da folha, independente das margens assimétricas do texto.
 for(const parte of [header,footer]){assert.match(parte,/<wp:positionH relativeFrom="page"><wp:posOffset>0/);assert.match(parte,/<wp:extent cx="7560310"/);}
 assert.match(header,/<wp:positionV relativeFrom="page"><wp:posOffset>0/);
 const y=Number(footer.match(/<wp:positionV[^>]*><wp:posOffset>(\d+)/)[1]);
 const altura=Number(footer.match(/<wp:extent[^>]*cy="(\d+)"/)[1]);
 assert.ok(Math.abs(y+altura-16838*635)<=1);
 assert.ok(Number(xml.match(/w:top="(\d+)"/)[1])>1701);
});
test('falha visível se o timbre configurado não carregou',async()=>{await assert.rejects(()=>gerarDocx('<p>Teste</p>','T',{cabecalho:{chave:'x'},imagens:{}},{parse}),/timbrado/);});

test('PRF com tabelas vazias exporta e preserva tabelas preenchidas e texto',async()=>{
 const html='<h1>PRF teste</h1><table></table><p>Sem registros ambientais</p><table><tbody><tr></tr></tbody></table><table><tr><th>Unidade</th></tr><tr><td>001<table></table></td></tr></table><p>Fim do relatório</p>';
 const blob=await gerarDocx(html,'PRF',{}, {parse});
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());
 const xml=await zip.file('word/document.xml').async('string');
 assert.equal((xml.match(/<w:tbl>/g)||[]).length,1);
 for(const texto of ['PRF teste','Sem registros ambientais','001','Fim do relatório'])assert.ok(xml.includes(texto));
 assert.match(xml,/w:tblHeader/);
});
