import test from 'node:test';import assert from 'node:assert/strict';
import {atualizarComRascunho,rejeicaoDefinitiva} from '../src/atualizacao-rascunho.js';
import {conciliarEdicoes} from '../src/concorrencia.js';
const base={metas:[{id:'m',status:'Em andamento',titulo:'Meta'}],planos:[{id:'p',etapas:[{id:'e',responsaveis:['a'],titulo:'Etapa'}]}]};
test('pendência em responsáveis não bloqueia aprovação, novas metas e notificações remotas',()=>{
 const local=structuredClone(base);local.planos[0].etapas[0].responsaveis=['a','b'];
 const remoto=structuredClone(base);remoto.metas[0].status='Aguardando aprovação';remoto.metas.push({id:'n',status:'Em andamento',titulo:'Nova meta'});remoto.notificacoes=[{id:'aviso'}];
 const r=atualizarComRascunho(base,local,remoto);assert.equal(r.dados.metas[0].status,'Aguardando aprovação');assert.equal(r.dados.metas.length,2);assert.deepEqual(r.dados.notificacoes,remoto.notificacoes);
 assert.deepEqual(r.dados.planos[0].etapas[0].responsaveis,['a','b']);assert.deepEqual(r.baseline.planos[0].etapas[0].responsaveis,['a']);assert.deepEqual(r.baseline.metas,remoto.metas);assert.equal(r.conflitos.length,0);
 const depois=structuredClone(remoto);depois.metas[0].status='Concluído';const r2=atualizarComRascunho(r.baseline,r.dados,depois);assert.equal(r2.dados.metas[0].status,'Concluído');assert.equal(r2.conflitos.length,0);
});
test('conflito real mantém baseline original entre leituras, sem sobrescrever valores remotos',()=>{
 const local=structuredClone(base);local.metas[0].titulo='Local';const remoto=structuredClone(base);remoto.metas[0].titulo='Remoto';
 const r=atualizarComRascunho(base,local,remoto);assert.equal(r.dados.metas[0].titulo,'Local');assert.equal(r.baseline.metas[0].titulo,'Meta');assert.equal(r.conflitos.length,1);
 const r2=atualizarComRascunho(r.baseline,r.dados,remoto);assert.equal(r2.conflitos.length,1);assert.equal(conciliarEdicoes(r2.baseline,r2.dados,remoto,{[r2.conflitos[0].chave]:'remoto'}).dados.metas[0].titulo,'Remoto');
});
test('inserção e remoção locais ficam pendentes; registros remotos novos não viram edições locais',()=>{
 const local=structuredClone(base);local.metas=[];local.planos.push({id:'novo-local',etapas:[]});const remoto=structuredClone(base);remoto.planos.push({id:'novo-remoto',etapas:[]});
 const r=atualizarComRascunho(base,local,remoto);assert.equal(r.dados.metas.length,0);assert.equal(r.baseline.metas.length,1);assert.equal(r.dados.planos.length,3);assert.equal(r.baseline.planos.length,2);assert.equal(r.baseline.planos.some(p=>p.id==='novo-local'),false);
});
test('remoção remota simultânea preserva edição para revisão e não restaura o registro silenciosamente',()=>{
 const local=structuredClone(base);local.metas[0].titulo='Local';const remoto=structuredClone(base);remoto.metas=[];const r=atualizarComRascunho(base,local,remoto);assert.equal(r.conflitos.length,1);assert.equal(r.baseline.metas[0].titulo,'Meta');
});
test('somente rejeições confirmadas podem liberar um novo pedido; perda de resposta mantém o recibo',()=>{
 for(const e of [{code:'42501'},{code:'PT409'},{code:'40001'},{status:403}])assert.equal(rejeicaoDefinitiva(e),true);
 for(const e of [new TypeError('Failed to fetch'),{status:503},{status:409},{}])assert.equal(rejeicaoDefinitiva(e),false);
});
