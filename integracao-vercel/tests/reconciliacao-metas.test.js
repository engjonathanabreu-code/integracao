import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,fixture,id} from './fixture.js';
import {projetar,prepararEdicao} from '../src/dados-compartilhados.js';
import {extrairIntencao} from '../src/intencoes-edicao.js';
import {provarMetasNoServidor} from '../src/reconciliacao-metas.js';

function caso(criar=false,notificar=false){
 const anterior=projetar(fixture(),{...blank(),notificacoes:[]}),actor=anterior.db.usuarios[0];
 const antes=anterior.db,depois=structuredClone(antes),meta=structuredClone(depois.metas[0]);
 if(criar){meta.id=id(78);delete meta.erpId;delete meta._compartilhado;depois.metas.push(meta);}
 else depois.metas[0]=meta;
 meta.titulo='Resultado recuperado';
 meta.historico=[{id:id(79),acao:'Editada',descricao:'Alterado',autor:actor.nome,autorId:actor.id,data:'2026-11-23T12:30:00Z'}];
 depois.auditoria.push({id:id(80),usuarioId:actor.id,usuario:actor.nome,acao:'Meta Alterada',data:'2026-11-23T12:30:00Z'});
 if(notificar)depois.notificacoes.push({id:id(81),titulo:'Nova meta',texto:'Aviso',usuarios:[actor.id],setores:[],rota:{pag:'metas'},lidaPor:[],data:'2026-11-23T12:30:00Z'});
 const planejar=(a,b,r)=>prepararEdicao(a,b,r,actor),ops=JSON.parse(JSON.stringify(planejar(antes,depois,anterior)));
 const banco=fixture();
 for(const op of ops){
  const rows=banco[op.table],row=rows.find(r=>Object.entries(op.key).every(([k,v])=>r[k]===v));
  if(row)Object.assign(row,op.changes);
  else rows.push({...op.key,...op.changes,created_at:'2026-11-23T12:31:00Z'});
 }
 const edicoes=extrairIntencao(antes,depois),item={conta:actor.erpRef,id:id(91),checksum:'hash-teste',original:{intencao:{edicoes,arquivos:{}}}};
 return {ops,banco,meta,item,provar:()=>provarMetasNoServidor(item,edicoes,projetar(banco,blank()),[item],planejar)};
}

for(const criar of [false,true])test(`conferência exata da meta ${criar?'criada':'editada'}, sem exigir hora do navegador`,()=>{
 const c=caso(criar);
 assert.ok(c.provar());c.item.payload=c.ops;assert.ok(c.provar());
 c.banco.meta_historico[0].descricao='Outra intenção';assert.equal(c.provar(),null);
});

test('id diferente, vínculo falso, ausência RLS, atividade parcial, arquivo e recibo são recusados',()=>{
 for(const alterar of [
  c=>c.banco.metas.find(x=>x.id===c.meta.id).id=id(12),
  c=>c.banco.meta_historico[0].meta_id=id(12),
  c=>c.banco.meta_historico.splice(0),
  c=>c.banco.integracao_auditoria.splice(0),
  c=>c.banco.metas.find(x=>x.id===c.meta.id).titulo+=' (mais nova)',
  c=>{c.item.original.intencao.arquivos.incompleto={version:'x'};},
  c=>{c.item.recibo={aliases:{}};},
 ]){
  const c=caso(true);c.item.payload=c.ops;
  assert.ok(c.provar());alterar(c);assert.equal(c.provar(),null);
 }
});

test('meta integral inclui histórico, auditoria e notificação com usuários e autoria exatos',()=>{
 for(const criar of [false,true]){
  const c=caso(criar,true);
  assert.ok(c.provar());c.item.payload=c.ops;assert.ok(c.provar());
  c.banco.integracao_notificacoes[0].dados.usuarios=[id(999)];
  assert.equal(c.provar(),null);
  c.banco.integracao_notificacoes=[];
  assert.equal(c.provar(),null);
 }
});

test('aprovação exige o status, a solicitação baixada, o histórico, o aviso e o evento de auditoria',()=>{
 const banco=fixture(),seed={...blank(),notificacoes:[]};
 banco.metas[0].status='Aguardando aprovação';
 banco.integracao_metas.push({colecao:'metas',registro_id:id(7),criado_por:id(1),referencia_tabela:'metas',referencia_id:id(7),
  dados:{solicitacaoConclusao:{por:id(1),data:'2026-11-23T12:00:00Z'}},updated_at:'2026-11-23T12:00:00Z'});
 const anterior=projetar(banco,seed),depois=structuredClone(anterior.db),actor=anterior.db.usuarios[0],meta=depois.metas[0];
 meta.status='Concluído';meta.solicitacaoConclusao=null;
 meta.historico.push({id:id(88),acao:'Conclusão aprovada',descricao:'Aprovação sintética',autor:actor.nome,autorId:actor.id,data:'2026-11-23T12:15:00Z'});
 depois.auditoria.push({id:id(89),acao:'Meta: conclusão aprovada',usuarioId:actor.id,usuario:actor.nome,data:'2026-11-23T12:15:00Z'});
 depois.notificacoes.push({id:id(90),titulo:'Conclusão aprovada',usuarios:[actor.id],rota:{pag:'metas'},data:'2026-11-23T12:15:00Z'});
 const planejar=(a,b,r)=>prepararEdicao(a,b,r,actor),ops=JSON.parse(JSON.stringify(planejar(anterior.db,depois,anterior)));
 for(const op of ops){
  const rows=banco[op.table],row=rows.find(r=>Object.entries(op.key).every(([k,v])=>r[k]===v));
  if(row)Object.assign(row,op.changes);
  else rows.push({...op.key,...op.changes,created_at:'2026-11-23T12:17:00Z'});
 }
 const edicoes=extrairIntencao(anterior.db,depois),item={conta:actor.erpRef,id:id(91),checksum:'hash-teste',original:{intencao:{edicoes,arquivos:{}}}};
 const provar=()=>provarMetasNoServidor(item,edicoes,projetar(banco,seed),[item],planejar);
 assert.ok(provar());item.payload=ops;assert.ok(provar());
 // A later request must not disappear just because the main status matches.
 banco.integracao_metas[0].dados.solicitacaoConclusao={por:id(1),data:'2026-11-23T13:00:00Z'};
 assert.equal(provar(),null);
});
