import test from 'node:test';
import assert from 'node:assert/strict';
import {exportarCopiaRecuperacao} from '../src/copia-recuperacao.js';
const conteudo=JSON.stringify({diario:{naoPersistidas:[{original:{intencao:{arquivos:{foto:{value:'bytes ainda locais'}}}}}]}});
test('quota no backup interno não impede exportar bytes e intenções não persistidas',async()=>{
 const passos=[],copias=[];
 const r=await exportarCopiaRecuperacao({conteudo,baixar:async texto=>{passos.push('download');copias.push(texto);},preservar:async texto=>{passos.push('backup');assert.equal(texto,conteudo);throw new DOMException('quota','QuotaExceededError');}});
 assert.deepEqual(passos,['download','backup']);assert.deepEqual(copias,[conteudo]);assert.deepEqual(r,{copiaInterna:false});
});
test('cópia interna e download recebem o mesmo snapshot completo',async()=>{
 const textos=[];assert.deepEqual(await exportarCopiaRecuperacao({conteudo,baixar:async x=>textos.push(x),preservar:async x=>textos.push(x)}),{copiaInterna:true});assert.deepEqual(textos,[conteudo,conteudo]);
});
test('erro ao iniciar download não é apresentado como exportação bem-sucedida',async()=>{
 let backups=0;await assert.rejects(exportarCopiaRecuperacao({conteudo,baixar:async()=>{throw Error('download indisponível');},preservar:async()=>backups++}),/download indisponível/);assert.equal(backups,0);
});
test('troca de sessão durante backup não publica sucesso na conta seguinte',async()=>{
 await assert.rejects(exportarCopiaRecuperacao({conteudo,baixar:async()=>{},preservar:async()=>{throw Object.assign(Error('sessão alterada'),{code:'SESSAO_ALTERADA'});}}),{code:'SESSAO_ALTERADA'});
});
