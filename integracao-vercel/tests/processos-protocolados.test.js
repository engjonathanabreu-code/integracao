import test from 'node:test';
import assert from 'node:assert/strict';
import {etapaDoAndamento} from '../src/processo-etapas.js';
import {ETAPAS_PREFEITURA, etapaPrefeitura, processoProtocolado, moverProcessoPrefeitura} from '../src/processos-protocolados.js';
import {projetar,prepararEdicao,mesclarEdicoes,copy} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';

test('protocolo considera etapa própria e histórico confirmado, sem assumir primeira etapa',()=>{
 assert.equal(processoProtocolado({etapaProcesso:'Topografia'}),false);
 assert.equal(processoProtocolado({etapaProcesso:'Protocolo'}),true);
 assert.equal(processoProtocolado({etapaProcesso:'Topografia',andamentos:[{status:'Protocolado'}]}),true);
 assert.equal(processoProtocolado({etapaPrefeitura:'CRF',ativo:false}),false);
 assert.equal(processoProtocolado({etapaPrefeitura:'CRF',extras:{arquivamento:{ativo:true}}}),false);
 assert.equal(etapaPrefeitura({etapaProcesso:'Protocolo'}),'');
});
test('movimentação municipal persiste etapa e histórico sem mudar fluxo interno ou fases',()=>{
 const base=fixture();base.processos_kanban[0].etapa_atual='Projetos';base.processos_kanban[0].etapa_prefeitura='Parecer Social';
 const s=projetar(base,blank()),d=copy(s.db),n=d.nucleos[0];const antigo=copy(n);
 moverProcessoPrefeitura(n,'Notificações',{id:id(500),por:'Equipe Teste',data:'2026-09-30T12:00:00Z'});
 assert.equal(n.etapaProcesso,antigo.etapaProcesso);assert.equal(n.etapa,antigo.etapa);
 const ops=prepararEdicao(s.db,d,s,s.db.usuarios[0]);
 const update=ops.find(o=>o.table==='processos_kanban');assert.deepEqual(update.changes,{etapa_prefeitura:'Notificações',etapa_prefeitura_iniciada_em:'2026-09-30T12:00:00Z'});
 assert.equal(update.expected.etapa_prefeitura,'Parecer Social');
 const history=ops.find(o=>o.table==='processos_kanban_historico');assert.equal(history.changes.fluxo,'prefeitura');assert.equal(history.changes.etapa_anterior,'Parecer Social');
 assert.equal(ops.length,2);
});
test('mudanças simultâneas em fluxos diferentes não disputam a mesma etapa',()=>{
 const base=fixture(),s=projetar(base,blank()),local=copy(s.db),remote=copy(s.db);
 moverProcessoPrefeitura(local.nucleos[0],'CRF',{id:id(501),por:'Pós',data:'2026-09-30T12:00:00Z'});
 remote.nucleos[0].etapaProcesso='Projetos';
 const merged=mesclarEdicoes(s.db,local,remote);assert.equal(merged.nucleos[0].etapaProcesso,'Projetos');assert.equal(merged.nucleos[0].etapaPrefeitura,'CRF');
});
test('andamentos gravam liberação à IA, enquanto observações usam histórico interno distinto',()=>{
 const s=projetar(fixture(),blank()),d=copy(s.db),n=d.nucleos[0];
 n.andamentos.unshift({id:id(502),status:'Notificações',operacional:'Em andamento',descricaoCliente:'Notificações em preparação.',observacao:'Anotação reservada',visivelIA:true,data:'2026-09-30T12:00:00Z'});
 n.observacoes.push({id:id(503),texto:'Anotação reservada',setor:'Pós-protocolo'});
 const ops=prepararEdicao(s.db,d,s,s.db.usuarios[0]);
 assert.equal(ops.find(o=>o.table==='processos_kanban_andamentos').changes.visivel_ia,true);
 assert.equal(ops.find(o=>o.table==='processos_kanban_observacoes').changes.texto,'Anotação reservada');
 assert.equal(ops.filter(o=>o.table==='processos_kanban').length,0);
 const refreshed=copy(s.base);refreshed.processos_kanban_andamentos=[{id:id(502),processo_id:id(5),status:'Notificações',descricao_cliente:'Notificações em preparação.',visivel_ia:true,orientacao_ia:'Confirmar próximos passos'}];
 assert.equal(projetar(refreshed,d).db.nucleos[0].andamentos[0].visivelIA,true);
});
test('etapa inválida é rejeitada e clicar na mesma etapa não duplica histórico',()=>{
 const n={etapaPrefeitura:'CRF',historicoEtapas:[]};
 assert.throws(()=>moverProcessoPrefeitura(n,'Outra',{}));
 moverProcessoPrefeitura(n,'CRF',{});assert.deepEqual(n.historicoEtapas,[]);
 assert.equal(ETAPAS_PREFEITURA.length,7);
});

test('registro geral de andamentos usa etapa municipal quando preenchida',()=>{
 assert.equal(etapaDoAndamento([{id:'n',etapaProcesso:'Protocolo',etapaPrefeitura:'Notificações'}],'n'),'Notificações');
});
