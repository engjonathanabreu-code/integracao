import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arquivarMeta,restaurarMeta,metaArquivada,metasAtivas,metasArquivadas,resumoMetaArquivada,podeArquivarMeta} from '../src/metas-arquivo.js';
import {metaOperacional} from '../src/planejamento-metas.js';
import {prazosDoCalendario} from '../src/calendario-prazos.js';
import {projetar,prepararEdicao,copy} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
import {fixture,blank,id} from './fixture.js';

const diretor={id:'d',nome:'Diretora fictícia',setor:'diretoria',ativo:true};
const MOTIVO='Meta duplicada da semana anterior';
const base=()=>({metas:[
 {id:'m1',titulo:'Meta a arquivar',status:'Em andamento',prazo:'2026-12-01',responsaveis:['d'],checklist:[{id:'c1',titulo:'Item',concluido:true}],comentarios:[{id:'k1',texto:'Comentário'}],arquivos:[{id:'a1',nome:'anexo.pdf'}],historico:[{id:'h1',acao:'Criada'}]},
 {id:'m2',titulo:'Meta ativa',status:'Em andamento',prazo:'2026-12-02',responsaveis:['d'],checklist:[],comentarios:[],arquivos:[],historico:[]}],usuarios:[diretor]});

test('EDI-M1: arquivar exige Diretoria e motivo, e preserva checklist, comentários, anexos e histórico',()=>{
 const db=base(),original=structuredClone(db.metas[0]);
 assert.throws(()=>arquivarMeta(db,'m1',MOTIVO,{id:'c',setor:'comercial',ativo:true}),/Diretoria/);
 assert.throws(()=>arquivarMeta(db,'m1',MOTIVO,{...diretor,ativo:false}),/Diretoria/);
 assert.throws(()=>arquivarMeta(db,'m1','curto',diretor),/motivo/);
 assert.throws(()=>arquivarMeta(db,'inexistente',MOTIVO,diretor),/não encontrada/);
 assert.deepEqual(db.metas[0],original,'recusas não alteram a meta');
 arquivarMeta(db,'m1',`  ${MOTIVO} `,diretor,'2026-11-25T12:00:00.000Z');
 const {arquivamento,...resto}=db.metas[0];
 assert.deepEqual(resto,original,'nada do conteúdo é apagado');
 assert.deepEqual(arquivamento,{ativo:true,motivo:MOTIVO,arquivadoEm:'2026-11-25T12:00:00.000Z',arquivadoPor:diretor.nome,arquivadoPorId:'d',status:'Em andamento'});
 assert.equal(db.metas.length,2,'a meta continua no cadastro');
 assert.equal(podeArquivarMeta(diretor),true);assert.equal(podeArquivarMeta(null),false);
});

test('EDI-M1: meta arquivada sai das listas ativas e dos indicadores, aparece no arquivo e volta ao restaurar',()=>{
 const db=base();arquivarMeta(db,'m1',MOTIVO,diretor,'2026-11-25T12:00:00.000Z');
 assert.deepEqual(metasAtivas(db.metas).map(m=>m.id),['m2']);
 assert.deepEqual(metasArquivadas(db.metas).map(m=>m.id),['m1']);
 assert.deepEqual(resumoMetaArquivada(db.metas[0]),{id:'m1',titulo:'Meta a arquivar',setor:'',status:'Em andamento',motivo:MOTIVO,arquivadoPor:diretor.nome,arquivadoEm:'2026-11-25T12:00:00.000Z',checklist:1,comentarios:1,arquivos:1,historico:1});
 // A visão entregue às telas (mesma composição de App.jsx) alimenta contadores e o calendário de prazos.
 const visao={...db,metas:metasAtivas(db.metas.filter(metaOperacional))};
 assert.deepEqual(prazosDoCalendario(visao,{hoje:'2026-11-25'}).map(i=>i.chave),['meta:m2']);
 assert.equal(visao.metas.filter(m=>m.status!=='Concluído').length,1);
 arquivarMeta(db,'m1','Outro motivo qualquer',diretor,'2026-11-26T12:00:00.000Z');
 assert.equal(db.metas[0].arquivamento.motivo,MOTIVO,'arquivar de novo não reescreve o registro');
 assert.throws(()=>restaurarMeta(db,'m1',{id:'c',setor:'comercial',ativo:true}),/Diretoria/);
 restaurarMeta(db,'m1',diretor,'2026-11-27T12:00:00.000Z');
 assert.equal(metaArquivada(db.metas[0]),false);assert.deepEqual(metasAtivas(db.metas).map(m=>m.id),['m1','m2']);
 assert.equal(db.metas[0].arquivamento.motivo,MOTIVO,'o motivo anterior fica no registro');
 assert.equal(db.metas[0].arquivamento.restauradoPorId,'d');assert.equal(db.metas[0].checklist.length,1);
 const copia=structuredClone(db);restaurarMeta(db,'m2',diretor);assert.deepEqual(db,copia,'restaurar meta ativa não faz nada');
});

test('EDI-M1: arquivar e restaurar passam pela fila como edição comum — sem remoção de linhas',()=>{
 const b=fixture();
 b.meta_checklist=[{id:id(20),meta_id:id(7),titulo:'Item fictício',concluido:false,concluido_por:null,concluido_em:null,created_by:id(1)}];
 b.meta_comentarios=[{id:id(21),meta_id:id(7),autor_id:id(1),texto:'Comentário fictício',created_at:'2026-11-20T12:00:00Z'}];
 const state=projetar(b,blank()),usuario=state.db.usuarios[0],novo=copy(state.db);
 assert.equal(usuario.setor,'diretoria');
 arquivarMeta(novo,id(7),MOTIVO,usuario,'2026-11-25T12:00:00.000Z');
 novo.metas[0].historico=[{id:id(30),acao:'Arquivada',descricao:MOTIVO,autor:usuario.nome,autorId:usuario.id,data:'2026-11-25T12:00:00.000Z'},...novo.metas[0].historico];
 const ops=prepararEdicao(state.db,novo,state,usuario);
 assert.equal(ops.some(o=>o.remove),false,'nenhuma linha é removida');
 assert.equal(ops.some(o=>['metas','meta_checklist','meta_comentarios','meta_arquivos'].includes(o.table)),false,'as tabelas do ERP não são alteradas');
 assert.deepEqual(ops.map(o=>o.table).sort(),['integracao_metas','meta_historico']);
 const marca=ops.find(o=>o.table==='integracao_metas');
 assert.deepEqual(marca.key,{colecao:'metas',registro_id:id(7)});assert.equal(marca.insert,true);
 assert.equal(marca.changes.referencia_tabela,'metas');assert.equal(marca.changes.referencia_id,id(7));
 assert.deepEqual(marca.changes.dados,{arquivamento:novo.metas[0].arquivamento});
 // Releitura no outro aparelho: a marca volta com a meta inteira e a confirmação fecha.
 const remoto=copy(b);remoto.integracao_metas.push({...marca.key,...marca.changes});
 remoto.meta_historico.push({id:id(30),meta_id:id(7),acao:'Arquivada',descricao:MOTIVO,autor_id:id(1),created_at:'2026-11-25T12:00:00Z'});
 const relido=projetar(remoto,blank());
 assert.equal(metaArquivada(relido.db.metas[0]),true);assert.equal(relido.db.metas[0].checklist.length,1);assert.equal(relido.db.metas[0].comentarios.length,1);
 assert.equal(alteracoesConfirmadas(state.db,novo,relido.db,{},ops),true);
 // Restaurar é uma atualização do mesmo complemento, conferindo o valor anterior.
 const restaurado=copy(relido.db);restaurarMeta(restaurado,id(7),usuario,'2026-11-26T12:00:00.000Z');
 const volta=prepararEdicao(relido.db,restaurado,relido,usuario);
 assert.equal(volta.length,1);assert.equal(volta[0].table,'integracao_metas');assert.equal(volta[0].remove,undefined);assert.equal(volta[0].insert,undefined);
 assert.equal(volta[0].changes.dados.arquivamento.ativo,false);assert.equal(volta[0].expected.dados.arquivamento.ativo,true);
});

test('EDI-M1: a tela arquiva com motivo, não remove a meta e filtra a visão única entregue às páginas',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(app,/d\.metas = d\.metas\.filter\(\(x\) => x\.id !== m\.id\)/,'a exclusão definitiva saiu da tela');
 assert.doesNotMatch(app,/Excluir esta meta\?/);
 assert.match(app,/<ModalMotivo titulo="Arquivar esta meta\?"[^\n]*arquivarMeta\(d, m\.id, motivo, usuario\)[^\n]*registrarHistoricoMeta\(d, m, "Arquivada"/);
 assert.match(app,/db: dadosVisiveis\(\{\.\.\.db,metas:metasAtivas\(db\.metas\.filter\(metaOperacional\)\)\}\)/,'todas as páginas recebem a visão sem arquivadas');
 assert.match(app,/metas:metasAtivas\(db\.metas\)\.filter\(m=>podeVerMeta\(m,usuario\)\)/,'citações do Mailing sem arquivadas');
 assert.match(app,/metasArquivadas=\{db\.metas\.filter\(metaArquivada\)\}/);
 assert.match(app,/\{gerencia && <ArquivoMetas metas=\{metasArquivadas\}/);
});
