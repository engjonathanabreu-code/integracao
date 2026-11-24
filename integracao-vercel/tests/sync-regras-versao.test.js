// Regras de comparação versionadas e validações prévias (24/11/2026).
// Somente dados fictícios; operações gravadas por eco e relidas pela projeção real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
import {extrairIntencao,recortarIntencao} from '../src/intencoes-edicao.js';
import {conciliarEdicoes} from '../src/concorrencia.js';
import {igualCampo,instanteISO} from '../src/igualdade-semantica.js';
import {edicaoSomenteLocal} from '../src/intencoes-locais.js';
import {classificarFalha,orientacaoPendencia,VERSAO_REGRAS_CONFIRMACAO,podeRetomarReleituraDivergente,podeRetomarReleituraDivergentePorVersao,marcarReleituraDivergente,conflitoPreEnvio,podeReprepararConflito,marcarConflitoRepreparado} from '../src/estado-sincronizacao.js';
import {validarCondicoesVenda,erroRestricoesCondicoes,normalizarCondicoesVenda,gravarCondicaoVenda} from '../src/condicoes-venda.js';
import {validarRegrasEvento} from '../src/diagnostico-validacao.js';
import {erroCodigoMorador} from '../src/codigo-morador.js';

const MAX=Number.MAX_SAFE_INTEGER,P=n=>'erp_'+id(n);
const seed=()=>({...blank(),notificacoes:[]});
function gravar(base,ops,local,aliases={}){
 for(const op of ops){
  if(op.action==='evento'){base.erp_eventos.push({id:aliases[op.tempId]||op.tempId,...op.payload,cor:'#3366FF',status:'ativo',created_by:base.profiles[0].id,serie_id:null});continue;}
  if(op.action)continue;
  const key=Object.fromEntries(Object.entries(op.key).map(([k,v])=>[k,aliases[v]||v]));
  const rows=base[op.table]||=[],row=rows.find(r=>Object.entries(key).every(([k,v])=>r[k]===v));
  if(row)Object.assign(row,op.changes);else rows.push({...key,...op.changes});
 }
 return projetar(base,local).db;
}

// A1 ------------------------------------------------------------------------
const divergente=extra=>({estado:'confirmado_aguardando_leitura',recibo:{aliases:{}},payload:[{table:'metas'}],preparado:{antes:{},depois:{}},proximaTentativa:MAX,
 erro:{fase:'releitura',codigo:'LEITURA_DIVERGENTE',categoria:'leitura'},...extra});
test('A1: releitura divergente esgotada em versão anterior recebe uma nova comparação por versão de regras',()=>{
 const antigo=divergente({releituraDivergenteVerificada:true});
 assert.equal(podeRetomarReleituraDivergente(antigo,1),false,'predicado sem versão continua preso');
 assert.equal(podeRetomarReleituraDivergentePorVersao(antigo,1),true);
 marcarReleituraDivergente(antigo);
 assert.equal(antigo.releituraRegrasVersao,VERSAO_REGRAS_CONFIRMACAO);
 assert.equal(podeRetomarReleituraDivergentePorVersao(antigo,1),false,'uma única vez por versão');
 assert.equal(podeRetomarReleituraDivergentePorVersao(divergente({releituraRegrasVersao:VERSAO_REGRAS_CONFIRMACAO-1}),1),true);
 for(const outro of [divergente({recibo:null}),divergente({payload:[]}),divergente({leaseAte:5}),divergente({proximaTentativa:10}),divergente({estado:'bloqueado_validacao'}),divergente({erro:{fase:'releitura',codigo:'TRANSPORTE',categoria:'transitoria'}})])
  assert.equal(podeRetomarReleituraDivergentePorVersao(outro,1),false);
});
const conflito=extra=>({estado:'bloqueado_conflito',original:{preparar:true},erro:{codigo:'PT409',fase:'preparacao',categoria:'conflito',rejeicaoConfirmada:true},proximaTentativa:MAX,...extra});
test('A1: só conflito detectado antes do envio pode ser preparado de novo, uma vez por versão',()=>{
 const i=conflito();
 assert.equal(conflitoPreEnvio(i),true);assert.equal(podeReprepararConflito(i,1),true);
 for(const outro of [conflito({payload:[{}]}),conflito({recibo:{}}),conflito({enviadoEm:1}),conflito({preparado:{}}),conflito({leaseAte:5}),conflito({original:{preparar:false}}),
  conflito({erro:{codigo:'PT409',fase:'envio'}}),conflito({erro:{codigo:'P0001',fase:'preparacao'}}),conflito({estado:'bloqueado_validacao'}),conflito({conflitoRegrasVersao:VERSAO_REGRAS_CONFIRMACAO})])
  assert.equal(podeReprepararConflito(outro,1),false);
 marcarConflitoRepreparado(i);
 assert.deepEqual([i.estado,i.proximaTentativa,i.conflitoRegrasVersao],['pendente_local',0,VERSAO_REGRAS_CONFIRMACAO]);
 // O conflito persiste: volta a bloqueado_conflito com o marcador e fica em revisão.
 assert.equal(podeReprepararConflito({...i,estado:'bloqueado_conflito'},1),false);
});

// A2 ------------------------------------------------------------------------
test('A2: instante só aceita data e hora ISO do mesmo momento',()=>{
 assert.equal(igualCampo('nucleos',['etapaIniciadaEm'],'2026-11-24T12:00:00.000Z','2026-11-24T12:00:00+00:00'),true);
 assert.equal(igualCampo('nucleos',['etapaIniciadaEm'],'2026-11-24T12:00:00.000Z','2026-11-24T09:00:00-03:00'),true);
 assert.equal(igualCampo('nucleos',['etapaIniciadaEm'],'2026-11-24T12:00:00.000Z','2026-11-24T12:00:01+00:00'),false);
 assert.equal(igualCampo('nucleos',['etapaIniciadaEm'],'','2026-11-24T12:00:00+00:00'),false);
 assert.equal(igualCampo('nucleos',['prazoSLA'],'2026-11-24T12:00:00.000Z','2026-11-24T12:00:00+00:00'),false,'campo sem adaptador continua estrito');
 assert.ok(Number.isNaN(instanteISO('2026-11-24')));assert.ok(Number.isNaN(instanteISO('amanhã')));
 // Eventos e checklist: na confirmação continuam valendo as regras que exigem a operação enviada.
 assert.equal(igualCampo('eventos',['inicio'],'2026-11-24T12:00:00.000Z','2026-11-24T12:00:00+00:00',{confirmacao:true}),false);
 assert.equal(igualCampo('eventos',['inicio'],'2026-11-24T12:00:00.000Z','2026-11-24T12:00:00+00:00'),true);
});
test('A2/conciliação: segunda movimentação antes da releitura não conflita com o próprio carimbo',()=>{
 const r=conciliarEdicoes({etapaProcesso:'Topografia',etapaIniciadaEm:'2026-11-24T12:00:00.000Z'},{etapaProcesso:'Projeto',etapaIniciadaEm:'2026-11-24T13:00:00.000Z'},
  {etapaProcesso:'Topografia',etapaIniciadaEm:'2026-11-24T12:00:00+00:00'},{},{colecao:'nucleos'});
 assert.deepEqual(r.conflitos,[]);assert.deepEqual(r.dados,{etapaProcesso:'Projeto',etapaIniciadaEm:'2026-11-24T13:00:00.000Z'});
 const ev=conciliarEdicoes({inicio:'2026-11-24T12:00:00.000Z',titulo:'a'},{inicio:'2026-11-24T14:00:00.000Z',titulo:'a'},{inicio:'2026-11-24T12:00:00+00:00',titulo:'a'},{},{colecao:'eventos'});
 assert.deepEqual(ev.conflitos,[]);assert.equal(ev.dados.inicio,'2026-11-24T14:00:00.000Z');
 const item=(c,em)=>({id:'i1',titulo:'x',concluido:c,concluido_em:em});
 const meta=conciliarEdicoes({id:'m',checklist:[item(true,'2026-11-24T12:00:00.000Z')]},{id:'m',checklist:[item(false,'')]},{id:'m',checklist:[item(true,'2026-11-24T12:00:00+00:00')]},{},{colecao:'metas'});
 assert.deepEqual(meta.conflitos,[]);assert.deepEqual(meta.dados.checklist,[item(false,'')]);
});
test('A2/conciliação: mesma etapa movida por duas pessoas fica com o carimbo do servidor; etapas diferentes continuam em conflito',()=>{
 const base={etapaProcesso:'Topografia',etapaIniciadaEm:'2026-11-20T10:00:00+00:00'};
 const mesma=conciliarEdicoes(base,{etapaProcesso:'Projeto',etapaIniciadaEm:'2026-11-24T13:00:00.000Z'},{etapaProcesso:'Projeto',etapaIniciadaEm:'2026-11-24T12:30:00+00:00'},{},{colecao:'nucleos'});
 assert.deepEqual(mesma.conflitos,[]);assert.equal(mesma.dados.etapaIniciadaEm,'2026-11-24T12:30:00+00:00');
 const outra=conciliarEdicoes(base,{etapaProcesso:'Projeto',etapaIniciadaEm:'2026-11-24T13:00:00.000Z'},{etapaProcesso:'Jurídico',etapaIniciadaEm:'2026-11-24T12:30:00+00:00'},{},{colecao:'nucleos'});
 assert.deepEqual(outra.conflitos.map(c=>c.caminho).sort(),[['etapaIniciadaEm'],['etapaProcesso']]);
 const semEtapa=conciliarEdicoes(base,{...base,etapaIniciadaEm:'2026-11-24T13:00:00.000Z'},{...base,etapaIniciadaEm:'2026-11-24T12:30:00+00:00'},{},{colecao:'nucleos'});
 assert.equal(semEtapa.conflitos.length,1,'carimbos diferentes sem mudança de etapa continuam em revisão');
 const outroModulo=conciliarEdicoes(base,{etapaProcesso:'Projeto',etapaIniciadaEm:'2026-11-24T13:00:00.000Z'},{etapaProcesso:'Projeto',etapaIniciadaEm:'2026-11-24T12:30:00+00:00'},{},{colecao:'planos'});
 assert.equal(outroModulo.conflitos.length,1);
});
test('A2/confirmação: carimbo do núcleo relido em outro formato confirma; outro instante diverge',()=>{
 const antes={nucleos:[{id:id(5),etapaIniciadaEm:''}]},depois={nucleos:[{id:id(5),etapaIniciadaEm:'2026-11-24T12:00:00.000Z'}]};
 assert.equal(alteracoesConfirmadas(antes,depois,{nucleos:[{id:id(5),etapaIniciadaEm:'2026-11-24T12:00:00+00:00'}]}),true);
 assert.equal(alteracoesConfirmadas(antes,depois,{nucleos:[{id:id(5),etapaIniciadaEm:'2026-11-24T12:00:05+00:00'}]}),false);
});

// A3 ------------------------------------------------------------------------
test('A3: corte local de 300 notificações em lote antigo não impede a confirmação das inserções enviadas',()=>{
 const base=fixture();base.profiles.push({id:id(50),nome:'Bia',tipo:'Projetos',setor:'Projetos',ativo:true});
 const nt=extra=>({id:crypto.randomUUID(),data:'2026-11-20T10:00:00.000Z',setores:[],usuarios:[],lidaPor:[],...extra});
 base.integracao_notificacoes=Array.from({length:300},(_,i)=>nt({titulo:'v'+i,usuarios:[P(1)]})).map(n=>({colecao:'notificacoes',registro_id:n.id,dados:n,criado_por:id(50),referencia_tabela:null,referencia_id:null}));
 const state=projetar(base,seed()),antes=state.db,depois=structuredClone(antes),tmp=crypto.randomUUID(),real=id(777);
 depois.eventos=[{id:tmp,titulo:'Reunião',descricao:'',inicio:'2026-11-25T09:00:00',fim:'2026-11-25T10:00:00',agendaId:'',participantes:[P(1),P(50)],publico:true,cor:'#0F5F5B',entidade:null,recorrencia:'nenhuma',recorrenciaAte:'',status:'ativo',criadoPor:P(1),respostas:{}}];
 const nova=nt({titulo:'Convite',usuarios:[P(50)]});
 depois.notificacoes=[nova,...depois.notificacoes].slice(0,300); // App.jsx novaNotificacao
 const edicoes=extrairIntencao(antes,depois); // cliente anterior ao filtro de remoções
 assert.ok(edicoes.some(e=>e.colecao==='notificacoes'&&e.antes.existe&&!e.depois.existe));
 const ops=prepararEdicao(antes,depois,state,antes.usuarios[0]);
 assert.equal(ops.some(o=>o.remove),false,'o encoder nunca envia a remoção');
 const pa=recortarIntencao(antes,edicoes),pd=recortarIntencao(depois,edicoes),aliases={[tmp]:real};
 const servidor=structuredClone(base),remoto=gravar(servidor,ops,antes,aliases);
 assert.equal(alteracoesConfirmadas(pa,pd,remoto,aliases,ops),true);
 assert.equal(alteracoesConfirmadas(pa,pd,remoto,aliases,[]),false,'sem o payload enviado não há prova');
 const semConvite={...remoto,notificacoes:remoto.notificacoes.filter(n=>n.id!==nova.id)};
 assert.equal(alteracoesConfirmadas(pa,pd,semConvite,aliases,ops),false,'inserção enviada continua exigida');
 const cortada=edicoes.find(e=>e.colecao==='notificacoes'&&!e.depois.existe).id;
 assert.equal(alteracoesConfirmadas(pa,pd,remoto,aliases,[...ops,{table:'integracao_notificacoes',key:{colecao:'notificacoes',registro_id:cortada},remove:true}]),false,'remoção realmente enviada continua conferida');
 // Outras coleções: registro removido que ainda existe continua divergente.
 assert.equal(alteracoesConfirmadas({metas:[{id:id(7)}]},{metas:[]},{metas:[{id:id(7)}]},{},ops),false);
});

// A4 ------------------------------------------------------------------------
test('A4: login com setor nulo no ERP não gera intenção; mudança real de setor ou perfil gera',()=>{
 const base=fixture();base.profiles=[{id:id(1),nome:'Eu',tipo:'Projetos',setor:null,ativo:true,email:'eu@example.invalid'}];
 const antes=projetar(base,blank()).db,depois=structuredClone(antes);
 assert.equal(antes.usuarios[0].setorERP,null);
 Object.assign(depois.usuarios[0],{setorERP:'',online:true,ultimaAtividade:'2026-11-24T12:00:00.000Z'}); // App.jsx fazerLoginERP
 depois.auditoria=[{id:crypto.randomUUID(),acao:'Entrou no sistema',usuarioId:P(1)}];
 assert.deepEqual(extrairIntencao(antes,depois),[]);
 const mudou=structuredClone(depois);mudou.usuarios[0].setorERP='Financeiro';
 assert.equal(extrairIntencao(antes,mudou).length,1);
 const u=antes.usuarios[0];
 assert.equal(edicaoSomenteLocal({colecao:'usuarios',id:u.id,antes:{existe:true,valor:u},depois:{existe:true,valor:{...u,tema:{modo:'escuro'}}}}),false);
});

// A5 ------------------------------------------------------------------------
test('A5/condições: valores ocultos de outra modalidade são limpos e nenhuma modalidade grava o que o banco recusa',()=>{
 const f={modalidade:'À vista',valorTotal:'1000,00',entrada:'',parcelas:'0',valorParcela:'',diaVencimento:'32',primeiroVencimento:'',reajuste:'Sem reajuste',observacoes:''};
 assert.equal(validarCondicoesVenda(f),'');
 assert.deepEqual([normalizarCondicoesVenda(f).parcelas,normalizarCondicoesVenda(f).diaVencimento],['','']);
 const r=gravarCondicaoVenda({},f,{atualizadoEm:'t',por:'x'});
 assert.deepEqual([r.comercial.parcelas,r.comercial.diaVencimento,r.comercial.valorTotal],['','','1000,00']);
 assert.equal(gravarCondicaoVenda({},{...f,modalidade:'Isento (REURB-S)'},{}).comercial.parcelas,'');
 const parcelado={...f,modalidade:'Parcelado sem entrada',parcelas:'10',valorParcela:'100,00',diaVencimento:'10'};
 assert.equal(validarCondicoesVenda(parcelado),'');
 assert.equal(gravarCondicaoVenda({},parcelado,{}).comercial.diaVencimento,'10','com parcelamento nada é limpo');
 assert.match(validarCondicoesVenda({...parcelado,parcelas:'0'}),/parcelas/);
 assert.match(validarCondicoesVenda({...parcelado,diaVencimento:'32'}),/vencimento/);
 // Cópia da regra do núcleo sem passar pelo formulário (App.jsx "Alterar só para este morador").
 assert.match(erroRestricoesCondicoes({...parcelado,diaVencimento:'0'}),/entre 1 e 31/);
 assert.match(erroRestricoesCondicoes({...parcelado,parcelas:'-2'}),/positivo/);
 assert.equal(erroRestricoesCondicoes({modalidade:'Entrada e parcelas',valorTotal:'',entrada:'',parcelas:'',valorParcela:'',diaVencimento:'10'}),'','condição vazia padrão é aceita');
});
test('A5/eventos: sobreposição na agenda e reserva não pública bloqueiam o salvar com mensagem',()=>{
 const outros=[{id:'e1',agendaId:'a1',status:'ativo',inicio:'2026-11-25T12:00:00+00:00',fim:'2026-11-25T13:00:00+00:00'},{id:'e2',agendaId:'a1',status:'cancelado',inicio:'2026-11-25T14:00:00+00:00',fim:'2026-11-25T15:00:00+00:00'}];
 const novo=(extra={})=>({id:undefined,agendaId:'a1',status:'ativo',publico:true,participantes:[P(1)],inicio:'2026-11-25T12:30:00+00:00',fim:'2026-11-25T13:30:00+00:00',...extra});
 const regras=(e,o={})=>validarRegrasEvento(e,{eventos:outros,...o}).map(p=>p.regra);
 assert.deepEqual(regras(novo()),['integracao_reserva_sem_sobreposicao']);
 assert.ok(validarRegrasEvento(novo(),{eventos:outros})[0].mensagem.length>10);
 assert.deepEqual(regras(novo({inicio:'2026-11-25T13:00:00+00:00',fim:'2026-11-25T14:00:00+00:00'})),[],'intervalo semiaberto');
 assert.deepEqual(regras(novo({inicio:'2026-11-25T14:00:00+00:00',fim:'2026-11-25T15:00:00+00:00'})),[],'evento cancelado não reserva');
 assert.deepEqual(regras(novo({agendaId:''})),[]);
 assert.deepEqual(regras(novo({id:'e1'})),[],'o próprio evento não conflita');
 assert.deepEqual(regras(novo({publico:false,inicio:'2026-11-26T12:00:00+00:00',fim:'2026-11-26T13:00:00+00:00'})),['evento_reserva_publica']);
 assert.deepEqual(regras(novo({agendaId:'',participantes:[P(1),'u_local']}),{perfisAtivos:[P(1)]}),['evento_participante_invalido']);
});
test('A5/código: o código gerado para um novo morador segue a regra do banco',()=>{
 assert.equal(erroCodigoMorador('IBI01_001',[],null),'');
 assert.match(erroCodigoMorador('SÃO01_001',[],null),/letras, números/);
 assert.match(erroCodigoMorador('S J01_001',[],null),/letras, números/);
 assert.match(erroCodigoMorador('IBI01_001',[{id:'x',codigo:'ibi01_001'}],null),/outro morador/);
});
test('A5/orientação: 23P01, 23514 e P0001 conhecidos orientam pelo campo, sem guardar o texto do servidor',()=>{
 const f=classificarFalha({code:'23P01',status:409,message:'conflicting key value violates exclusion constraint "integracao_reserva_sem_sobreposicao"'});
 assert.equal(f.regra,'integracao_reserva_sem_sobreposicao');assert.equal(JSON.stringify(f).includes('conflicting'),false);
 assert.match(orientacaoPendencia({estado:'bloqueado_validacao',erro:{...f,rejeicaoConfirmada:true,fase:'envio'}}),/reserva ativa nesta agenda/);
 const p=classificarFalha({code:'P0001',status:400,message:'Reservas de ativos devem ser públicas para a equipe'});
 assert.match(orientacaoPendencia({estado:'bloqueado_validacao',erro:{...p,rejeicaoConfirmada:true,fase:'envio'}}),/precisam ser públicas/);
 const c=classificarFalha({code:'23514',status:400,message:'new row violates check constraint "fin_receb_clientes_dia_vencimento_check"'});
 assert.match(orientacaoPendencia({estado:'bloqueado_validacao',erro:{...c,rejeicaoConfirmada:true,fase:'envio'}}),/entre 1 e 31/);
 assert.equal(classificarFalha({code:'P0001',status:400,message:'Outra regra qualquer'}).regra,undefined);
 assert.match(orientacaoPendencia({estado:'bloqueado_validacao',erro:{codigo:'P0001',categoria:'validacao'}}),/P0001 não identifica/);
});

// A6 ------------------------------------------------------------------------
test('A6: recusas locais do encoder têm código e status 422 (validação, não transporte)',()=>{
 const base=fixture(),state=projetar(base,blank()),antes=state.db,ator=antes.usuarios[0];
 const semVinculo=structuredClone(antes);semVinculo.metas.push({id:'meta-local',titulo:'x',status:'pendente',responsaveis:[],checklist:[],comentarios:[],historico:[],associacao_tipo:'avulsa',associacao_id:''});
 assert.throws(()=>prepararEdicao(antes,semVinculo,state,ator),e=>e.code==='CADASTRO_LOCAL_SEM_VINCULO'&&e.status===422&&classificarFalha(e).categoria==='validacao');
 const semMunicipio=structuredClone(antes);semMunicipio.nucleos[0].municipioId='municipio-inexistente';
 assert.throws(()=>prepararEdicao(antes,semMunicipio,state,ator),e=>e.code==='MUNICIPIO_NAO_ENCONTRADO'&&e.status===422&&classificarFalha(e).categoria==='validacao');
 assert.match(orientacaoPendencia({estado:'bloqueado_validacao',erro:{codigo:'CADASTRO_LOCAL_SEM_VINCULO',categoria:'validacao'}}),/Nada foi enviado/);
});
