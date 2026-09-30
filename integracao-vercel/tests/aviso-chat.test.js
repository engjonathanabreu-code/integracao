import test from 'node:test';import assert from 'node:assert/strict';import {mensagensNovasChat} from '../src/aviso-chat.js';
const usuario={id:'u'},m={id:'m',autorId:'a',data:'2026-09-30T10:00:00Z'},c={id:'c',participantes:['u','a'],mensagens:[m],lidaPor:{}};
for(const tipo of ['Administrador','Comercial','Topografia','Projetos','Jurídico','Financeiro','Consulta'])test(`popup para ${tipo} independe da presença do remetente`,()=>{const r=mensagensNovasChat({usuarios:[{id:'u',tipo},{id:'a',online:false,ultimaAtividade:'2020-01-01'}],conversas:[c]},usuario,null);assert.equal(r.novas.length,1);assert.equal(r.novas[0].mensagem.id,'m');assert.equal(mensagensNovasChat({conversas:[c]},usuario,r.ids).novas.length,0);});
test('não avisa mensagens próprias, lidas ou de conversas alheias',()=>{
 for(const conversa of [{...c,lidaPor:{u:m.data}},{...c,participantes:['a','b']},{...c,mensagens:[{...m,autorId:'u'}]}])assert.equal(mensagensNovasChat({conversas:[conversa]},usuario,null).novas.length,0);
});
test('mensagem atrasada, remetente ausente e carga inicial vazia não impedem popup',()=>{
 const primeiro=mensagensNovasChat({conversas:[]},usuario,null);const r=mensagensNovasChat({conversas:[c]},usuario,primeiro.ids);assert.equal(r.novas.length,1);assert.equal(r.novas[0].autor,undefined);
});
test('avisa somente novas mensagens não lidas após atualizações e ordena o último aviso',()=>{
 const r=mensagensNovasChat({conversas:[c]},usuario,null),novo={...m,id:'novo',data:'2026-09-30T11:00:00Z'};
 const s=mensagensNovasChat({conversas:[{...c,mensagens:[novo,m]}]},usuario,r.ids);assert.deepEqual(s.novas.map(x=>x.mensagem.id),['novo']);assert.equal(s.ids.size,2);
});
