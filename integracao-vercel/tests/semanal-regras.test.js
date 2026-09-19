import test from 'node:test';
import assert from 'node:assert/strict';
import {historicoMunicipal} from '../src/semanal-regras.js';
test('histórico municipal reúne meses e cards arquivados sem misturar municípios ou duplicar registros',()=>{
 const dados={municipios:[{id:'a',municipio_id:'cidade',ativo:true},{id:'b',municipio_id:'cidade',ativo:false},{id:'c',municipio_id:'outra',ativo:true}],semanas:[{id:'jan',municipio_id:'a',mes:1,ano:2026,semana:1},{id:'fev',municipio_id:'b',mes:2,ano:2026,semana:3},{id:'fora',municipio_id:'c'}],registros:[{id:'1',semana_id:'jan',created_at:'2026-01-01',comentario:'Original'},{id:'2',semana_id:'fev',created_at:'2026-02-01'},{id:'3',semana_id:'fora'}],arquivos:[{id:'arquivo',semana_id:'fev',nome:'original.pdf'}]};
 const h=historicoMunicipal(dados,'cidade');assert.deepEqual(h.registros.map(r=>r.id),['2','1']);assert.equal(h.registros[0].semana.card.ativo,false);assert.equal(h.registros[1].comentario,'Original');assert.equal(h.arquivos[0].semana.mes,2);assert.equal(dados.registros[0].semana,undefined);
 assert.deepEqual(historicoMunicipal(dados,'cidade','a'),h);
});
test('municípios em revisão mantêm históricos separados por card até confirmar o vínculo',()=>{
 const dados={municipios:[{id:'a',municipio_id:null},{id:'b',municipio_id:null}],semanas:[{id:'sa',municipio_id:'a'},{id:'sb',municipio_id:'b'}],registros:[{id:'ra',semana_id:'sa'},{id:'rb',semana_id:'sb'}]};
 assert.deepEqual(historicoMunicipal(dados,null,'a').registros.map(r=>r.id),['ra']);assert.equal(historicoMunicipal(dados,null).registros.length,0);
});
