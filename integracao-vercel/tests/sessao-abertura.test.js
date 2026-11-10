import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath,pathToFileURL} from 'node:url';
test('hook real invalida abertura de A durante entrada de B sem persistência cruzada',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'integracao-sessao-'));
 try{const bundle=join(dir,'harness.mjs');await build({entryPoints:['tests/sincronizacao-ciclo.jsx'],bundle:true,format:'esm',platform:'node',define:{'import.meta.env':'{}'},outfile:bundle,logLevel:'silent'});
 const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./sessao-abertura-runner.mjs',import.meta.url)),pathToFileURL(bundle).href],{timeout:15000});assert.match(stdout,/"ok":true/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
