import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import mammoth from 'mammoth';
import { aplicarCondicionais, expandirLacos, resolverCaminho, marcadorControle, lacunasDoDocumento, ESTILOS_WORD } from '../src/modelos-html.js';
import { encontrarLacunas } from '../src/modelos-prf.js';
import { docxRealce } from './docx-realce.js';
const fonte = readFileSync(new URL('../src/App.jsx', import.meta.url),'utf8');
const recortar = (inicio,fim) => fonte.slice(fonte.indexOf(inicio),fonte.indexOf(fim,fonte.indexOf(inicio)));
const contexto = vm.createContext({ aplicarCondicionais, expandirLacos, marcadorControle, paragrafo: t=>`<p>${t}</p>`, valoresDocumento: d=>d });
vm.runInContext(recortar('function preencherModelo(', '\nconst corpoDoModelo') + '\n' + recortar('const corpoDoModelo', '\nfunction FormaDeVenda') + '\n' + recortar('const MARCADORES_DOC =', '// Representantes da empresa') + '\nthis.funcoes={preencherModelo,montarDocumentoComercial,MARCADORES_DOC};',contexto);
const {preencherModelo,montarDocumentoComercial,MARCADORES_DOC}=contexto.funcoes;
test('modelo legado mantém exatamente o HTML de todos os marcadores atuais, incluindo os 29 originais',()=>{
 assert.ok(MARCADORES_DOC.length>=29);
 const dados=Object.fromEntries(MARCADORES_DOC.map(([chave],i)=>[chave,i%4===0?'':`<b>Valor ${i} &amp; texto</b>`]));
 const modelo=MARCADORES_DOC.map(([chave])=>`<p class='original'>{{${chave}}}<br/></p>`).join('\n');
 const esperado=MARCADORES_DOC.map(([chave])=>`<p class='original'>${dados[chave]}<br/></p>`).join('\n');
 assert.equal(preencherModelo(modelo,dados),esperado);
 assert.equal(montarDocumentoComercial('teste',dados,{modelosDoc:{teste:modelo}},{}),esperado);
});
test('controles não entram na contagem de lacunas do upload nem do documento',()=>{
 const html='<p>{{#cada:unidades}}{{unidade.nome}}{{/cada}}{{#se:ativo}}{{senao}}{{/se}} ______ {{nome}}</p>';
 assert.equal(encontrarLacunas(html).length,3);
 assert.deepEqual(lacunasDoDocumento(html),{marcadores:['unidade.nome','nome'],tracos:1});
});
test('caminhos aceitam zero e falso, rejeitam propriedades herdadas',()=>{
 assert.equal(resolverCaminho({nucleo:{area:0}},'nucleo.area'),0);
 assert.equal(resolverCaminho({nucleo:{ativo:false}},'nucleo.ativo'),false);
 assert.equal(resolverCaminho({},'constructor.name'),undefined);
 assert.equal(resolverCaminho({nucleo:{}},'nucleo.ausente'),undefined);
});
test('DOCX com marca-texto produz mark usando as opções dos dois uploads',async()=>{
 const resultado=await mammoth.convertToHtml({buffer:Buffer.from(docxRealce,'base64')},ESTILOS_WORD);
 assert.equal(resultado.value,'<p><mark>Decisão humana</mark> Texto normal</p>');
 assert.equal(resultado.messages.length,0);
 assert.equal((fonte.match(/converter\(\{ arrayBuffer: await arq.arrayBuffer\(\) \}, ESTILOS_WORD\)/g)||[]).length,2);
});
