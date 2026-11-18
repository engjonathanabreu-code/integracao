import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('hook real conserva aviso de exportação até nova exportação ou mudança de sessão',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'integracao-exportacao-aviso-'));
 try{
  const bundle=join(dir,'harness.mjs');
  await build({entryPoints:['tests/sincronizacao-ciclo.jsx'],bundle:true,jsx:'automatic',format:'esm',platform:'node',define:{'import.meta.env':'{}'},outfile:bundle,logLevel:'silent',plugins:[{
   name:'diario-local-isolado',setup(b){b.onLoad({filter:/diario-compartilhado\.js$/},()=>({loader:'js',contents:`
    export function criarDiarioCompartilhado(o){
     let items=[];
     globalThis.emitirDiarioTeste=novos=>{items=novos;o.atualizou(items);};
     return {migrar:async()=>{},atualizar:async()=>{o.atualizou(items);return items;},itens:()=>items,materializar:x=>x,adicionarArquivos:async()=>{},executar:async()=>items,exportar:async()=>({intencoes:items,naoPersistidas:[]}),fechar:()=>{}};
    }
   `}));}
  }]});
  const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('./exportacao-aviso-hook-runner.mjs',import.meta.url)),pathToFileURL(bundle).href],{timeout:15000});
  assert.match(stdout,/"ok":true/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
