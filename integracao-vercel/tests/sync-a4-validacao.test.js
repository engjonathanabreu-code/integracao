// A4: regras de 23514/23P01/P0001 com campo e orientação, e validadores prévios puros.
import test from 'node:test';
import assert from 'node:assert/strict';
import {regraDaFalha,orientacaoRegra,restricaoPermitida,validarSobreposicaoEvento,validarRegrasEvento,validarRestricoesProcesso} from '../src/diagnostico-validacao.js';

test('A4: 23P01 de sobreposição de agenda identifica campo e regra sem guardar a mensagem',()=>{
 const e={code:'23P01',message:'conflicting key value violates exclusion constraint "integracao_reserva_sem_sobreposicao"',details:'Key (agenda_id, tstzrange(inicio, fim))=(privado)'};
 const r=regraDaFalha(new Error('envelope',{cause:e}));
 assert.equal(r.regra,'integracao_reserva_sem_sobreposicao');assert.equal(r.codigo,'23P01');assert.equal(r.campo,'inicio');
 assert.doesNotMatch(JSON.stringify(r),/privado|Key|exclusion/);
 assert.equal(restricaoPermitida(r.regra),null,'a allowlist do suporte remoto (SQL) não muda');
 assert.match(orientacaoRegra(r.regra),/mesmo horário/);
});

test('A4: P0001 e 23514 conhecidos têm campo; desconhecidos não',()=>{
 assert.equal(regraDaFalha({code:'P0001',message:'Participante inválido'}).campo,'participantes');
 assert.equal(regraDaFalha({code:'P0001',message:'Reservas de ativos devem ser públicas para a equipe'}).campo,'publico');
 assert.equal(regraDaFalha({code:'P0001',message:'Registro indisponível ou sem permissão: metas'}).regra,'registro_indisponivel');
 assert.equal(regraDaFalha({code:'23514',constraint:'fin_receb_clientes_dia_vencimento_check'}).campo,'comercial.diaVencimento');
 assert.equal(regraDaFalha({code:'23514',message:'violates check constraint "processos_kanban_historico_fluxo_check"'}).campo,'historicoEtapas.fluxo');
 for(const e of [{code:'P0001',message:'Outra regra'},{code:'23514',constraint:'nome_privado'},{code:'23P01',constraint:'__proto__'},{code:'23505',constraint:'integracao_reserva_sem_sobreposicao'},null])assert.equal(regraDaFalha(e),null);
});

test('A4: validarSobreposicaoEvento espelha o EXCLUDE (mesma agenda, ativo, intervalo semiaberto)',()=>{
 const ev=(id,inicio,fim,extra={})=>({id,agendaId:'ag',status:'ativo',inicio,fim,...extra});
 const outros=[ev('a','2026-11-24T09:00:00-03:00','2026-11-24T10:00:00-03:00'),ev('b','2026-11-24T13:00:00Z','2026-11-24T14:00:00Z',{status:'cancelado'}),ev('c','2026-11-24T13:00:00Z','2026-11-24T14:00:00Z',{agendaId:'outra'})];
 const novo=ev('n','2026-11-24T12:30:00Z','2026-11-24T13:30:00Z');
 assert.deepEqual(validarSobreposicaoEvento(novo,outros)[0].conflitos,['a'],'fusos diferentes comparados por instante');
 assert.deepEqual(validarSobreposicaoEvento(ev('n','2026-11-24T13:00:00Z','2026-11-24T14:00:00Z'),outros),[],'encostar no fim não sobrepõe');
 assert.deepEqual(validarSobreposicaoEvento({...novo,agendaId:''},outros),[]);
 assert.deepEqual(validarSobreposicaoEvento({...novo,id:'a'},outros),[],'o próprio evento não conflita');
 assert.equal(validarSobreposicaoEvento(ev('n','2026-11-24T14:00:00Z','2026-11-24T13:00:00Z'),[])[0].regra,'evento_intervalo_invalido');
});

test('A4: validarRegrasEvento e validarRestricoesProcesso',()=>{
 const e={id:'n',agendaId:'ag',publico:false,participantes:['erp_x','y'],cor:'#000000',inicio:'2026-11-24T12:00:00Z',fim:'2026-11-24T13:00:00Z'};
 const regras=validarRegrasEvento(e,{perfisAtivos:['x'],anterior:{cor:'#FFFFFF'}}).map(p=>p.regra);
 assert.deepEqual(regras,['evento_reserva_publica','evento_participante_invalido','evento_cor_administracao']);
 assert.deepEqual(validarRegrasEvento({...e,publico:true,cor:'#FFFFFF'},{perfisAtivos:['x','y'],anterior:{cor:'#FFFFFF'}}),[]);
 const p=c=>validarRestricoesProcesso({processo:{comercial:c}}).map(x=>x.regra);
 assert.deepEqual(p({diaVencimento:'32',parcelas:'0'}),['fin_receb_clientes_dia_vencimento_check','fin_receb_clientes_numero_parcelas_check']);
 assert.deepEqual(p({diaVencimento:'',parcelas:''}),[],'ausente é permitido');
 assert.deepEqual(p({diaVencimento:'10',parcelas:'12'}),[]);
 const n=validarRestricoesProcesso({nucleo:{etapaPrefeitura:'Outra',prioridade:'Urgente',historicoEtapas:[{fluxo:'x'}]}},{prioridades:['Baixa','Normal','Alta']}).map(x=>x.campo);
 assert.deepEqual(n,['etapaPrefeitura','prioridade','historicoEtapas.fluxo']);
 assert.deepEqual(validarRestricoesProcesso({nucleo:{etapaPrefeitura:'CRF',prioridade:'Urgente'}}),[],'sem lista do ERP não presume a regra');
});
