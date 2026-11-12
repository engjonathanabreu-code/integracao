import test from 'node:test';
import assert from 'node:assert/strict';
import {atualizarFichas} from '../src/sincronizacao-clientes.js';
import {diagnosticoOperacao} from '../src/diagnostico-sincronizacao.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';

test('refresh isolado avança fichas boas, preserva cache da falha e distingue ausência autorizada',async()=>{
 const anterior={fin_receb_clientes:[{id:'a',nome:'cache'},{id:'b'},{id:'c'}],integracao_moradores:[{registro_id:'a',dados:{valor:'anterior'}}],integracao_complementos:[{registro_id:'a',_tabela:'integracao_moradores',dados:{valor:'anterior'}}]};
 const base={fin_receb_clientes:[{id:'a',nome:'resumo'}],integracao_moradores:[],integracao_complementos:[]};
 await atualizarFichas(base,[{id:'a'},{id:'b'},{id:'c'}],async c=>{
  if(c.id==='a')throw Object.assign(Error('conteúdo privado não vai para diagnóstico'),{status:403,code:'42501'});
  return c.id==='b'?{clientes:[{id:'b',nome:'novo'}],complementos:[]}:{clientes:[],complementos:[],indisponivel:true};
 },{isolarFalhas:true,anterior});
 assert.deepEqual(base.fin_receb_clientes,[{id:'a',nome:'cache'},{id:'b',nome:'novo'}]);assert.deepEqual(base.integracao_moradores,anterior.integracao_moradores);
 assert.deepEqual(base._falhasFichas,[{id:'a',codigo:'42501',status:403,categoria:'permissao'}]);
 await atualizarFichas(base,[{id:'a'}],async()=>({clientes:[],complementos:[],indisponivel:true}),{isolarFalhas:true,anterior});
 assert.equal(base._falhasFichas.length,0);assert.deepEqual(base.fin_receb_clientes,[{id:'b',nome:'novo'}]);
});
test('preparação continua estrita; mudança de sessão interrompe até refresh isolado',async()=>{
 for(const isolarFalhas of [false,true]){
  let chamadas=0;const erro=Object.assign(Error('sessão mudou'),{code:'SESSAO_ALTERADA'});
  await assert.rejects(atualizarFichas({},[{id:'a'},{id:'b'}],async()=>{chamadas++;throw erro;},{isolarFalhas}),e=>e===erro);assert.equal(chamadas,1);
 }
 await assert.rejects(atualizarFichas({},[{id:'a'}],async()=>{throw Object.assign(Error('503'),{status:503});}),{status:503});
});
test('diagnóstico local informa fases, tempo, tentativas, dependências sem conteúdo ou identificadores de negócio',()=>{
 const i={id:id(1),pedido:id(2),clienteVersao:'build-123',estado:'resultado_desconhecido',fase:'recibo',criadoEm:100,enviadoEm:200,tentativas:2,tentativasTotais:7,dependencias:[id(3),'CPF-privado'],original:{cpf:'123.456.789-00',modulo:'metas'},payload:[{senha:'segredo'}],erro:{codigo:'mensagem privada',message:'segredo'}};
 const d=diagnosticoOperacao(i,500);assert.equal(d.situacao,'resultado_incerto');assert.equal(d.fase,'recibo');assert.equal(d.tempoMs,400);assert.equal(d.tentativasTotais,7);assert.deepEqual(d.dependencias,[id(3)]);
 assert.doesNotMatch(JSON.stringify(d),/privad|segredo|123\.456|senha|payload|original/);
 assert.equal(diagnosticoOperacao({...i,enviadoEm:null}).situacao,'nao_enviado');
 assert.equal(diagnosticoOperacao({...i,erro:{rejeicaoConfirmada:true}}).situacao,'recusado');
 assert.equal(diagnosticoOperacao({...i,recibo:{},erro:{codigo:'LEITURA_DIVERGENTE'}}).situacao,'gravado_leitura_divergente');
 assert.equal(diagnosticoOperacao({...i,recibo:{}}).situacao,'gravado_leitura_pendente');
 assert.equal(diagnosticoOperacao({...i,recibo:{},lidoEm:300}).propagacao,'confirmada_neste_aparelho');
 assert.equal(d.outrosAparelhos,'nao_verificado');
});
test('contrato real do calendário confirma horários equivalentes somente nas colunas e operações enviadas',()=>{
 const base=fixture();base.erp_eventos=[{id:id(90),titulo:'Evento',descricao:'',inicio:'2026-11-11T12:00:00+00:00',fim:'2026-11-11T13:00:00+00:00',participantes:[],status:'ativo',publico:true,created_by:id(1)}];
 const state=projetar(base,blank()),before=state.db,after=structuredClone(before);after.eventos[0].inicio='2026-11-11T10:00:00-03:00';after.eventos[0].fim='2026-11-11T11:00:00-03:00';
 const ops=prepararEdicao(before,after,state,before.usuarios[0]);const remoteBase=structuredClone(base);Object.assign(remoteBase.erp_eventos[0],{inicio:'2026-11-11T13:00:00+00:00',fim:'2026-11-11T14:00:00+00:00'});const remote=projetar(remoteBase,blank()).db;
 assert.equal(alteracoesConfirmadas(before,after,remote,{},ops),true);assert.equal(alteracoesConfirmadas(before,after,remote,{},[]),false);
 remote.eventos[0].inicio='2026-11-11T13:01:00+00:00';assert.equal(alteracoesConfirmadas(before,after,remote,{},ops),false);
});
test('contratos conservam distinções de IDs, nulos, datas de calendário, setor e perfil',()=>{
 for(const [colecao,campo,b,l,r] of [['metas','prazo','2026-01-01','2026-01-02','2026-01-02T00:00:00Z'],['usuarios','setor','A','Topografia','Projetos'],['usuarios','funcao','Analista','Diretor','Analista'],['metas','observacoes','x',null,''],['processos','financeiroRef','a','b','c']]){
  assert.equal(alteracoesConfirmadas({[colecao]:[{id:'a',[campo]:b}]},{[colecao]:[{id:'a',[campo]:l}]},{[colecao]:[{id:'a',[campo]:r}]}),false);
 }
});

test('falha de ficha legada conserva vínculo financeiro descoberto apenas no cache',async()=>{
 const anterior={fin_receb_clientes:[{id:'financeiro-real',nome:'preservado'}],integracao_moradores:[{registro_id:'legado',referencia_tabela:'fin_receb_clientes',referencia_id:'financeiro-real',dados:{etapa:1}}]};
 const base={fin_receb_clientes:[],integracao_moradores:[]};
 await atualizarFichas(base,[{id:'legado'}],async()=>{throw Object.assign(Error('503'),{status:503});},{isolarFalhas:true,anterior});
 assert.deepEqual(base.fin_receb_clientes,anterior.fin_receb_clientes);assert.deepEqual(base.integracao_moradores,anterior.integracao_moradores);
 await atualizarFichas(base,[{id:'legado'}],async()=>({clientes:[],complementos:[],indisponivel:true}),{isolarFalhas:true,anterior});
 assert.deepEqual(base.fin_receb_clientes,[]);assert.deepEqual(base.integracao_moradores,[]);assert.deepEqual(base._falhasFichas,[]);
});
