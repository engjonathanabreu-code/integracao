import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projetarViagensCalendario,conflitosViagens,AGENDAS_VEICULOS} from '../src/calendario-viagens.js';
import {ocorrenciasDoEvento} from '../src/calendario-ocorrencias.js';
import {eventoDoFiltro} from '../src/calendario-prazos.js';
const row={solicitacao_id:'req1',veiculo_id:'hb20',solicitante_id:'uuid1',solicitante_nome:'Ana',inicio:'2026-11-18',fim:'2026-11-20'};
const base=()=>({agendas:[{...AGENDAS_VEICULOS.hb20,nome:'Carro corporativo'}],eventos:[],usuarios:[{id:'local1',erpRef:'uuid1',nome:'Ana',setor:'campo'}]});
test('viagem aprovada entra na agenda exata e no solicitante, sem mutar a base',()=>{
 const db=base(),antes=structuredClone(db),p=projetarViagensCalendario(db,[row]);
 assert.deepEqual(db,antes);assert.equal(p.eventos.length,1);assert.equal(p.agendas.length,1);
 assert.equal(p.eventos[0].agendaId,AGENDAS_VEICULOS.hb20.id);assert.deepEqual(p.eventos[0].participantes,['local1']);
 assert.equal(eventoDoFiltro(p.eventos[0],p,{usuarioId:'local1'}),true);
 assert.equal(eventoDoFiltro(p.eventos[0],p,{usuarioId:'outro'}),false);
 assert.deepEqual(ocorrenciasDoEvento(p.eventos[0]),['2026-11-18','2026-11-19','2026-11-20']);
});
test('repoll, alteração de data/carro e cancelamento não duplicam nem deixam evento antigo',()=>{
 const db=base();const first=projetarViagensCalendario(db,[row,row]);assert.equal(first.eventos.length,1);
 const changed=projetarViagensCalendario(db,[{...row,veiculo_id:'gol',inicio:'2026-11-21',fim:'2026-11-21'}]);
 assert.equal(changed.eventos[0].id,first.eventos[0].id);assert.equal(changed.eventos[0].agendaId,AGENDAS_VEICULOS.gol.id);
 assert.equal(changed.agendas.find(a=>a.id===AGENDAS_VEICULOS.gol.id).somenteLeitura,true);
 assert.deepEqual(ocorrenciasDoEvento(changed.eventos[0]),['2026-11-21']);
 assert.deepEqual(projetarViagensCalendario(db,[]),db);
});
test('desconhecidos e incompletos não são atribuídos por aproximação',()=>{
 assert.equal(projetarViagensCalendario(base(),[{...row,veiculo_id:'caminhonete'},{...row,solicitante_id:''},{...row,fim:'2026-11-01'}]).eventos.length,0);
 const e=projetarViagensCalendario({...base(),usuarios:[]},[row]).eventos[0];assert.deepEqual(e.participantes,['erp_uuid1']);
});
test('sobreposições manuais e entre viagens são sinalizadas, cancelados não bloqueiam',()=>{
 const db=base();db.eventos=[{id:'manual',agendaId:AGENDAS_VEICULOS.hb20.id,inicio:'2026-11-19T10:00:00-03:00',fim:'2026-11-19T11:00:00-03:00',status:'ativo'}];
 assert.equal(conflitosViagens(projetarViagensCalendario(db,[row]).eventos).length,1);
 db.eventos[0].status='cancelado';assert.equal(conflitosViagens(projetarViagensCalendario(db,[row]).eventos).length,0);
 assert.equal(conflitosViagens(projetarViagensCalendario(base(),[row,{...row,solicitacao_id:'req2'}]).eventos).length,2);
});
test('projeção nunca disponibiliza finanças, mensagens ou anexos e não muda eventos normais',()=>{
 const e=projetarViagensCalendario(base(),[{...row,valor:123,mensagem:'privado',anexos:['segredo']}]).eventos[0];
 assert.equal(JSON.stringify(e).includes('segredo'),false);assert.equal(e.valor,undefined);
 assert.deepEqual(ocorrenciasDoEvento({inicio:'2026-11-18T08:00:00-03:00',fim:'2026-11-20T09:00:00-03:00'}),['2026-11-20']);
});
test('integração fica fora da persistência e controles de edição e cancela listeners',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/evento && !evento\.origemFinanceiro && <ModalEvento db=\{baseDb\}/);
 assert.match(app,/podeGerenciar && !a\.somenteLeitura/);
 const hook=readFileSync(new URL('../src/use-viagens-calendario.js',import.meta.url),'utf8');
 assert.match(hook,/scope\.conferir\(\)/);assert.match(hook,/clearInterval\(timer\)/);assert.match(hook,/rows:\[\],erro:/);
 assert.doesNotMatch(hook,/localStorage|sessionStorage|service_role/);
});
