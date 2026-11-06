import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('hook real confirma leitura, rejeita falhas e recupera recibo sem repetir a mutação',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'integracao-confirmacao-'));
 try{
  const bundle=join(dir,'harness.mjs');
  await build({entryPoints:['tests/sincronizacao-ciclo.jsx'],bundle:true,format:'esm',platform:'node',define:{'import.meta.env':'{}'},outfile:bundle,logLevel:'silent'});
  for(const scenario of ['sucesso','sucessivas','permissao','conflito','leitura','resposta-perdida','sessao','offline']){
   const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('./confirmacao-hook-runner.mjs',import.meta.url)),pathToFileURL(bundle).href,scenario],{timeout:15000});
   assert.match(stdout,/"ok":true/,scenario);
  }
 }finally{
  if(!resolve(dir).startsWith(resolve(tmpdir())+ '\\')&&!resolve(dir).startsWith(resolve(tmpdir())+'/'))throw new Error('Diretório de testes inválido');
  rmSync(dir,{recursive:true,force:true});
 }
});
