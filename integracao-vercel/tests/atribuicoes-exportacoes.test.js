import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {acaoPermitida,registrarContrato,limparContratos} from '../src/permissoes-contrato.js';
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const source=app.slice(app.indexOf('async function baixarDocumentoCliente('),app.indexOf('function baixarArquivo('));
test('exportadores reais de cliente e memorial exigem o recurso correto antes de gerar arquivo',async()=>{
 const u={id:'fixture',ativo:true};try{
 for(const [regras,permitidos] of [[{clientes:{exportar:false},nucleos:{exportar:false}},[]],[{documentos:{exportar:false}},[]],[{nucleos:{exportar:false}},['pdf','docx']],[{clientes:{exportar:true},nucleos:{exportar:true}},['pdf','docx','memorial']]]){
  registrarContrato(u.id,{regras});const gerados=[];
  const gate=async r=>{if(!acaoPermitida(u,r,'exportar'))throw Error('negado');};
  const fn=new Function('exigirAcao','documentoPdf','documentoDocx',source+';return {baixarDocumentoCliente,baixarMemorialNucleo};')(gate,{baixarPdf:async()=>gerados.push('pdf')},{baixarDocx:async(...args)=>gerados.push(args[3]==='memorial'?'memorial':'docx')});
  for(const formato of ['pdf','docx']){const p=fn.baixarDocumentoCliente('html','titulo',null,'arquivo',formato);if(permitidos.includes(formato))await p;else await assert.rejects(p,/negado/);}
  const p=fn.baixarMemorialNucleo('html','titulo',null,'memorial');if(permitidos.includes('memorial'))await p;else await assert.rejects(p,/negado/);
  assert.deepEqual(gerados,permitidos);
 }
 }finally{limparContratos();}
});
