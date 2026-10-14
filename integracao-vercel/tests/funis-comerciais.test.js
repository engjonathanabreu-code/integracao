import test from 'node:test';import assert from 'node:assert/strict';
import {apresentarFunis,acaoDoFunil} from '../src/funis-comerciais.js';
const participantes=[{id:'a',nome:'Comercial A'},{id:'b',nome:'Comercial B'}];
const dados=(nome)=>({versao:1,cidades:[{id:'c',nome,uf:'SC',etapa:'carteiras'}],nucleos:[{nucleoId:'n',cidadeId:'c',nome:'Núcleo',carteira:'reserva'}],historico:[]});
test('consolidado identifica responsáveis e distingue IDs iguais sem alterar os registros individuais',()=>{
 const rows=participantes.map(p=>({id:p.id,dados:dados(p.nome)})),antes=structuredClone(rows);
 const f=apresentarFunis(participantes,rows,{consolidado:true});assert.deepEqual(f.cidades.map(c=>c.id),['a:c','b:c']);assert.deepEqual(f.nucleos.map(n=>n.cidadeId),['a:c','b:c']);assert.deepEqual(f.cidades.map(c=>c.responsavelNome),['Comercial A','Comercial B']);assert.deepEqual(rows,antes);
 const individual=apresentarFunis([participantes[1]],rows);assert.equal(individual.cidades.length,1);assert.equal(individual.cidades[0].id,'c');assert.equal(individual.cidades[0].nome,'Comercial B');
});
test('ações enviadas não contêm metadados visuais, dono ou autor',()=>{
 assert.deepEqual(acaoDoFunil({tipo:'cidade',id:'c',nome:'Cidade',uf:'SC',etapa:'prospeccao',responsavelId:'b',responsavelNome:'Pessoa',autor:'Fake'}),{tipo:'cidade',id:'c',nome:'Cidade',uf:'SC',etapa:'prospeccao'});
 assert.equal(apresentarFunis(participantes,[]).cidades.length,0);
});
