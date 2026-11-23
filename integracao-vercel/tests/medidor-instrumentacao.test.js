import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pluginMedicaoCampo} from '../scripts/plugin-medicao-campo.mjs';
test('instrumentação do commit funciona antes da transformação React sem alterar a fixture',async()=>{
 const file=new URL('sincronizacao-ciclo.jsx',import.meta.url),antes=await readFile(file,'utf8');
 const cacheDir=await mkdtemp(join(tmpdir(),'integracao-medidor-test-'));
 const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),cacheDir,plugins:[pluginMedicaoCampo()],server:{watch:null},logLevel:'silent'});
 try{const r=await server.transformRequest('/tests/sincronizacao-ciclo.jsx');assert.match(r.code,/medicao:campo-commit/);assert.equal(await readFile(file,'utf8'),antes);}
 finally{await server.close();await rm(cacheDir,{recursive:true,force:true});}
});
