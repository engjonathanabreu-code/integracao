import test from 'node:test';
import assert from 'node:assert/strict';
import {colecaoDerivada,edicaoDerivada,preservarDerivadasFixadas} from '../src/projecoes-derivadas.js';
import {extrairIntencao,aplicarIntencao,recursosIntencao,recortarIntencao} from '../src/intencoes-edicao.js';
import {complementos} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
const contagens=n=>[{municipio_id:'m',remessa_id:'r',total:n,ativos:n}];
const edicaoContagem=()=>({colecao:'_contagensClientes',antes:{existe:true,valor:contagens(1)},depois:{existe:true,valor:contagens(2)}});
const base=()=>({processos:[{id:'p',etapa:0,nota:'base'}],_contagensClientes:contagens(1)});
const local=()=>({...base(),processos:[{id:'p',etapa:1,nota:'base'}],_contagensClientes:contagens(2)});
test('contagem derivada não cria intenção ao aparecer, mudar, desaparecer ou reordenar',()=>{
 for(const [a,b] of [[{}, {_contagensClientes:contagens(1)}],[{_contagensClientes:contagens(1)},{_contagensClientes:contagens(2)}],[{_contagensClientes:contagens(1)},{}],[{_contagensClientes:[...contagens(1),...contagens(2)]},{_contagensClientes:[...contagens(2),...contagens(1)]}]])assert.deepEqual(extrairIntencao(a,b),[]);
});
test('exclusão é explícita e não ignora campos desconhecidos nem registros malformados',()=>{
 assert.equal(colecaoDerivada('_outroCampo'),false);assert.equal(edicaoDerivada({...edicaoContagem(),id:'registro'}),false);
 assert.equal(extrairIntencao({_outroCampo:1},{_outroCampo:2}).length,1);
});
test('intenção mista mantém mudança de negócio e auditoria, sem depender de contagem',()=>{
 const a=base(),b=local();a.auditoria=[];b.auditoria=[{id:'a',acao:'Processo alterado'}];
 const e=extrairIntencao(a,b);assert.deepEqual(e.map(x=>x.colecao),['processos','auditoria']);assert.deepEqual(recursosIntencao(e),['["processos","p"]']);
});
test('histórico com contagem obsoleta não altera a projeção remota nem o original',()=>{
 const e=[...extrairIntencao(base(),local()),edicaoContagem()],original=structuredClone(e),remote={...base(),_contagensClientes:contagens(3)};
 const r=aplicarIntencao(remote,e);assert.deepEqual(r.dados._contagensClientes,contagens(3));assert.equal(r.dados.processos[0].etapa,1);assert.equal(r.conflitos.length,0);assert.deepEqual(e,original);assert.deepEqual(remote.processos,base().processos);
});
test('conflito real de negócio continua exigindo decisão com contagem histórica presente',()=>{
 const remote={...base(),processos:[{id:'p',etapa:2,nota:'outra pessoa'}],_contagensClientes:contagens(3)},e=[...extrairIntencao(base(),local()),edicaoContagem()],r=aplicarIntencao(remote,e);
 assert.equal(r.conflitos.length,1);assert.deepEqual(r.conflitos[0].caminho,['processos','p','etapa']);assert.equal(r.dados.processos[0].nota,'outra pessoa');
});
test('escolha antiga de contagem não sobrescreve projeção atual e recorte conserva negócio',()=>{
 const e=[...extrairIntencao(base(),local()),edicaoContagem()],r=aplicarIntencao({...base(),_contagensClientes:contagens(3)},e,{escolhas:{'["_contagensClientes"]':'local'}});
 assert.deepEqual(r.dados._contagensClientes,contagens(3));assert.deepEqual(recursosIntencao(e),['["processos","p"]']);assert.deepEqual(recortarIntencao(r.dados,e),{processos:r.dados.processos});
});
test('preparação não grava projeção como configuração mas mantém configuração editável',()=>{
 const a={_contagensClientes:contagens(1),configuracaoReal:1},b={_contagensClientes:contagens(2),configuracaoReal:2};
 const ops=complementos(a,b,{base:{integracao_complementos:[]},bindings:[]},{erpRef:'fixture'});
 assert.equal(ops.length,1);assert.equal(ops[0].key.registro_id,'configuracaoReal');assert.equal(ops[0].changes.dados.valor,2);
});
test('confirmação de payload antigo não é afrouxada nem ignora contagem já enviada',()=>{
 const antes=base(),depois=local(),remote={...depois,_contagensClientes:contagens(3)},ops=[{table:'integracao_configuracoes',key:{colecao:'config',registro_id:'_contagensClientes'},changes:{dados:{valor:contagens(2)}}}],original=structuredClone(ops);
 assert.equal(alteracoesConfirmadas(antes,depois,remote,{},ops),false);assert.deepEqual(ops,original);
});

test('prévia de payload fixado conserva decisão explícita sem afrouxar confirmação automática',()=>{
 const e=[edicaoContagem()],remote={_contagensClientes:contagens(3)};
 const p=aplicarIntencao(remote,e,{preservarDerivadas:true});assert.deepEqual(p.conflitos.map(c=>c.caminho),[['_contagensClientes']]);
 const r=aplicarIntencao(remote,e,{preservarDerivadas:true,escolhas:{'["_contagensClientes"]':'remoto'}});assert.deepEqual(r.dados,remote);assert.equal(r.conflitos.length,0);
 assert.deepEqual(recortarIntencao(remote,e,{preservarDerivadas:true}),remote);assert.deepEqual(recortarIntencao(remote,e),{});
});

test('somente preparação comprovadamente sem projeção dispensa sua comparação antiga',()=>{
 assert.equal(preservarDerivadasFixadas({}),false);assert.equal(preservarDerivadasFixadas({payload:[]}),true);
 assert.equal(preservarDerivadasFixadas({payload:[],preparado:{antes:{},depois:{}}}),false);
 assert.equal(preservarDerivadasFixadas({payload:[],preparado:{antes:{_contagensClientes:[]},depois:{}}}),true);
 assert.equal(preservarDerivadasFixadas({payload:[{table:'integracao_configuracoes',key:{colecao:'config',registro_id:'_contagensClientes'}}],preparado:{antes:{},depois:{}}}),true);
});
