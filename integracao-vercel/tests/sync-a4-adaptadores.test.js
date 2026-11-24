// C4 (A4): cada adaptador de campo com a causa demonstrada pelo encoder/projeção
// reais e as guardas que mantêm divergentes membro faltante/extra, valor diferente
// e registro ausente.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,blank,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
import {adaptadoresCampo,igualCampo,igualSemantico,TIPOS_ADAPTADOR} from '../src/igualdade-semantica.js';
import {aplicarIntencao} from '../src/intencoes-edicao.js';
import {conciliarEdicoes} from '../src/concorrencia.js';
import {COLUNAS_FINANCEIRAS} from '../src/contrato-financeiro.js';

const pessoa=n=>'erp_'+id(n);
// Aplica as operações como o banco gravaria e relê pela projeção real.
function gravar(base,ops){
 for(const op of ops){
  if(op.action)continue;
  const rows=base[op.table]||=[],row=rows.find(r=>Object.entries(op.key).every(([k,v])=>r[k]===v));
  if(row)Object.assign(row,op.changes);else rows.push({...op.key,...op.changes});
 }
 return projetar(base,blank()).db;
}

test('A4: registro de adaptadores só usa tipos do contrato e nenhum campo financeiro',()=>{
 const financeiros=new Set(['comercial',...Object.keys(COLUNAS_FINANCEIRAS),...Object.values(COLUNAS_FINANCEIRAS)]);
 for(const a of adaptadoresCampo){
  assert.ok(TIPOS_ADAPTADOR.includes(a.tipo),a.tipo);
  assert.ok(a.caminho.every(p=>!financeiros.has(p)),JSON.stringify(a));
  assert.notEqual(a.colecao,'processos');
 }
 assert.equal(igualCampo('processos',['comercial','valorTotal'],'1','1,0'),false);
 assert.equal(igualCampo('planos',['responsaveis'],[pessoa(1),pessoa(2)],[pessoa(2),pessoa(1)]),false,'caminho não registrado continua estrito');
});

test('A4/eventos: descrição vazia gravada como NULL pelo encoder confirma; texto diferente diverge',()=>{
 const base=fixture();
 base.erp_eventos=[{id:id(40),titulo:'Reunião',descricao:null,inicio:'2026-11-24T12:00:00+00:00',fim:'2026-11-24T13:00:00+00:00',agenda_id:null,participantes:[id(1)],publico:true,cor:'#0F5F5B',status:'ativo',created_by:id(1)}];
 const state=projetar(base,blank()),antes=state.db,depois=structuredClone(antes);
 assert.equal(antes.eventos[0].descricao,null,'projeção devolve r.descricao sem text()');
 // App.jsx (FormEvento): descricao: inicial.descricao || "" e Object.assign no salvar.
 Object.assign(depois.eventos[0],{descricao:'',titulo:'Reunião geral'});
 const ops=prepararEdicao(antes,depois,state,antes.usuarios[0]);
 const op=ops.find(o=>o.table==='erp_eventos');
 assert.equal(op.changes.descricao,null,'encoder envia nullText("")');
 const remoto=gravar(base,ops);
 assert.equal(remoto.eventos[0].descricao,null);
 assert.equal(igualSemantico(remoto.eventos[0].descricao,''),false);
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),true,'mesma descrição vazia em outra forma');
 const outro=structuredClone(remoto);outro.eventos[0].descricao='Outra';
 assert.equal(alteracoesConfirmadas(antes,depois,outro,{},ops),false);
 const semTitulo=structuredClone(remoto);semTitulo.eventos[0].titulo='Reunião';
 assert.equal(alteracoesConfirmadas(antes,depois,semTitulo,{},ops),false,'demais campos continuam estritos');
 assert.equal(alteracoesConfirmadas(antes,depois,{...remoto,eventos:[]},{},ops),false,'registro ausente diverge');
});

test('A4/eventos: participantes lidos em outra ordem confirmam; faltante ou extra diverge',()=>{
 const antes={eventos:[{id:id(40),participantes:[pessoa(1)]}]},depois={eventos:[{id:id(40),participantes:[pessoa(2),pessoa(1)]}]};
 const lido=xs=>({eventos:[{id:id(40),participantes:xs}]});
 assert.equal(alteracoesConfirmadas(antes,depois,lido([pessoa(1),pessoa(2)])),true);
 for(const xs of [[pessoa(1)],[pessoa(1),pessoa(2),pessoa(3)],[pessoa(1),pessoa(3)]])assert.equal(alteracoesConfirmadas(antes,depois,lido(xs)),false,JSON.stringify(xs));
 // Evento novo (inserção parcial): a regra vale dentro do registro.
 const novo={eventos:[{id:id(41),titulo:'Novo',participantes:[pessoa(2),pessoa(1)]}]};
 assert.equal(alteracoesConfirmadas({eventos:[]},novo,{eventos:[{id:id(41),titulo:'Novo',participantes:[pessoa(1),pessoa(2)],_compartilhado:true}]}),true);
 assert.equal(alteracoesConfirmadas({eventos:[]},novo,{eventos:[{id:id(41),titulo:'Novo',participantes:[pessoa(1)]}]}),false);
});

test('A4/usuarios: setorERP vazio do login e NULL do perfil confirmam; setor diferente diverge',()=>{
 const base=fixture();base.profiles[0].setor=null;
 const state=projetar(base,blank()),antes=state.db,depois=structuredClone(antes);
 assert.equal(antes.usuarios[0].setorERP,null,'projeção canônica: setorERP:p.setor');
 // App.jsx entrar(): setorERP: u.setorERP ?? q.setorERP, com u.setorERP = p.setor || "".
 Object.assign(depois.usuarios[0],{setorERP:'',online:true,ultimaAtividade:'2026-11-24T12:00:00.000Z'});
 const ops=prepararEdicao(antes,depois,state,antes.usuarios[0]);
 const remoto=gravar(base,ops);
 assert.equal(remoto.usuarios[0].setorERP,null,'setorERP é canônico: o complemento não o substitui');
 assert.equal(alteracoesConfirmadas(antes,depois,remoto,{},ops),true);
 const outro=structuredClone(remoto);outro.usuarios[0].setorERP='Financeiro';
 assert.equal(alteracoesConfirmadas(antes,depois,outro,{},ops),false);
});

test('A4/notificacoes: lidaPor é conjunto; leitor simultâneo a mais confirma (aditivo), leitor esperado ausente diverge',()=>{
 const n=(lidaPor)=>({notificacoes:[{id:'nt_1',titulo:'Aviso',lidaPor}]});
 assert.equal(alteracoesConfirmadas(n([pessoa(2)]),n([pessoa(2),pessoa(1)]),n([pessoa(1),pessoa(2)])),true);
 assert.equal(alteracoesConfirmadas(n([pessoa(2)]),n([pessoa(2),pessoa(1)]),n([pessoa(2),pessoa(3),pessoa(1)])),true,'o SQL acrescenta ao lidaPor do servidor: outro leitor simultâneo não invalida a confirmação');
 assert.equal(alteracoesConfirmadas(n([pessoa(2)]),n([pessoa(2),pessoa(1)]),n([pessoa(2)])),false);
 // Na conciliação, leituras concorrentes deixam de ser conflito.
 const r=aplicarIntencao(n([pessoa(2),pessoa(3)]),[{colecao:'notificacoes',id:'nt_1',antes:{existe:true,valor:n([pessoa(2)]).notificacoes[0]},depois:{existe:true,valor:n([pessoa(2),pessoa(1)]).notificacoes[0]}}]);
 assert.deepEqual(r.conflitos,[]);
 assert.deepEqual([...r.dados.notificacoes[0].lidaPor].sort(),[pessoa(1),pessoa(2),pessoa(3)].sort());
});

test('A4/usuarios: presença continua fora da comparação; nome continua estrito',()=>{
 const antes={usuarios:[{id:pessoa(1),nome:'A',online:false,ultimaAtividade:''}]};
 const depois={usuarios:[{id:pessoa(1),nome:'A',online:true,ultimaAtividade:'2026-11-24T12:00:00.000Z'}]};
 assert.equal(alteracoesConfirmadas(antes,depois,antes),true);
 const nome=structuredClone(depois);nome.usuarios[0].nome='B';
 assert.equal(alteracoesConfirmadas(antes,nome,antes),false);
});

test('[GUARDA] A4: conjunto inválido ou com duplicatas não confirma por adaptador nem faz merge',()=>{
 assert.equal(igualCampo('eventos',['participantes'],['x','x'],['x','x']),true,'fora de metas, lista inválida volta ao contrato estrito');
 assert.equal(igualCampo('eventos',['participantes'],['x','x','y'],['x','y','y']),false);
 assert.equal(igualCampo('metas',['responsaveis'],['Pessoa A'],['Pessoa A']),false);
 const r=conciliarEdicoes({participantes:['a','a']},{participantes:['a']},{participantes:['a','a','b']},{},{colecao:'eventos'});
 assert.equal(r.conflitos.length,1,'sem conjunto válido não há merge automático');
 assert.equal(conciliarEdicoes({titulo:null},{titulo:''},{titulo:'x'},{},{colecao:'eventos'}).conflitos.length,1,'nulo_vazio só vale nos campos registrados');
});
