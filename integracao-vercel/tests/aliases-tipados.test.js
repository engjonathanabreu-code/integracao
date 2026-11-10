import test from 'node:test';import assert from 'node:assert/strict';
import {remapearIdentidades} from '../src/aliases-tipados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
test('aliases preservam texto livre e reescrevem apenas referências conhecidas',()=>{
 const value={id:'tmp',titulo:'tmp',descricao:'tmp',documento:{conteudo:'tmp'},participantes:['tmp'],responsaveis:['tmp'],respostas:{tmp:'aceito'},entidade:{id:'tmp'},nested:{registro_id:'tmp'}};
 const result=remapearIdentidades(value,{tmp:'canonical'});
 assert.equal(result.titulo,'tmp');assert.equal(result.descricao,'tmp');assert.equal(result.documento.conteudo,'tmp');assert.equal(result.id,'canonical');assert.deepEqual(result.participantes,['canonical']);assert.deepEqual(result.respostas,{canonical:'aceito'});assert.equal(result.entidade.id,'canonical');assert.equal(value.id,'tmp');
});
test('confirmação não aceita texto livre corrompido por alias',()=>{
 const before={eventos:[]},after={eventos:[{id:'tmp',titulo:'tmp'}]};
 assert.equal(alteracoesConfirmadas(before,after,{eventos:[{id:'canonical',titulo:'canonical'}]},{tmp:'canonical'}),false);
 assert.equal(alteracoesConfirmadas(before,after,{eventos:[{id:'canonical',titulo:'tmp'}]},{tmp:'canonical'}),true);
});
