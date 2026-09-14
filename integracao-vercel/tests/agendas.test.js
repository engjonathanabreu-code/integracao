import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {copy,projetar,prepararEdicao} from '../src/dados-compartilhados.js';
test('editing an agenda updates only its existing name and color with a conflict check',()=>{
 const b=fixture();b.erp_agendas=[{id:id(90),nome:'Sala de reuniões',cor:'#123456'}];const s=projetar(b,blank()),n=copy(s.db);
 Object.assign(n.agendas[0],{nome:'Sala principal',cor:'#abcdef'});
 assert.deepEqual(prepararEdicao(s.db,n,s,n.usuarios[0]),[{table:'erp_agendas',key:{id:id(90)},expected:{nome:'Sala de reuniões',cor:'#123456'},changes:{nome:'Sala principal',cor:'#abcdef'}}]);
 assert.deepEqual(b.erp_agendas,[{id:id(90),nome:'Sala de reuniões',cor:'#123456'}]);
});
test('a saved preference cannot elevate the authenticated ERP role',()=>{
 const b=fixture();b.profiles[0].tipo='Topografia';b.integracao_usuarios=[{colecao:'usuarios',registro_id:`erp_${id(1)}`,dados:{tipoERP:'Administrador'}}];
 assert.equal(projetar(b,blank()).db.usuarios[0].tipoERP,'Topografia');
});
