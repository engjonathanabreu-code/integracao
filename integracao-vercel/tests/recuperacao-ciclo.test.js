import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('real React sync hook recovers conflicts, refused deletions, lost receipts and reservations',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'integracao-sync-'));
 try{
  const bundle=join(dir,'harness.mjs');
  await build({entryPoints:['tests/sincronizacao-ciclo.jsx'],bundle:true,format:'esm',platform:'node',define:{'import.meta.env':'{}'},outfile:bundle,logLevel:'silent'});
  for(const scenario of ['cor-reserva','cor-reserva-rejeitada','cor-baseline-antiga','cor-resposta-perdida','reserva-apos-conflito','meta-historico-ausente','municipio-restaurado','concorrente-divergente','concorrente-igual','concorrente-independente','exclusao-recusada','resposta-perdida','reserva-recusada','permissao-persistente']){
   const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('./recuperacao-ciclo-runner.mjs',import.meta.url)),pathToFileURL(bundle).href,scenario],{timeout:15000});
   if(scenario==='permissao-persistente'){assert.match(stdout,/rejeicao-preservada/);continue;}
   assert.match(stdout,/"pending":false/,scenario);assert.match(stdout,/"conflitos":0/,scenario);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
