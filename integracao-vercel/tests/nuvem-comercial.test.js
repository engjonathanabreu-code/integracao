import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
test('cloud exposes add and move to Commercial using existing UI Guide buttons',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nuvem-ui-'));
 try{
  const outfile=join(dir,'render.mjs');
  await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Funil from './src/FunilInstitucional.jsx';export const render=(tipoERP)=>renderToStaticMarkup(React.createElement(Funil,{usuario:{tipoERP,ativo:true},db:{funilInstitucional:{versao:1,cidades:[{id:'c',nome:'Cidade Teste',uf:'SC',etapa:'nuvens'}],nucleos:[],historico:[]}},mutar:()=>{}}));`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},outfile,logLevel:'silent'});
  const {render}=await import(pathToFileURL(outfile));
  const comercial=render('Comercial');assert.match(comercial,/btn btn-primario[^>]*>.*?Adicionar município/s);assert.match(comercial,/Etapa de Cidade Teste/);assert.doesNotMatch(comercial,/Adicionar núcleo institucional/);
  const consulta=render('Projetos');assert.doesNotMatch(consulta,/Adicionar município|Etapa de Cidade Teste/);
  assert.match(render('Administrador'),/Adicionar núcleo institucional/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
