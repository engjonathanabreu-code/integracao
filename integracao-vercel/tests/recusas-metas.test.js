import test from 'node:test';
import assert from 'node:assert/strict';
import {solicitarConclusaoMeta,recusarConclusaoMeta,totalRecusasMeta,totalRecusasUsuario} from '../src/recusas-metas.js';
import {fixture,blank,id} from './fixture.js';
import {copy,projetar,prepararEdicao} from '../src/dados-compartilhados.js';
const ana={id:'ana',nome:'Ana',setor:'topografia'}, bia={id:'bia',nome:'Bia',setor:'projeto'}, diretor={id:'diretor',nome:'Diretor',setor:'diretoria'};
const meta=()=>({id:'meta',status:'Em andamento',responsaveis:['ana','bia'],historico:[]});
const dia=n=>`2026-09-${String(n).padStart(2,'0')}T12:00:00Z`;
test('request → refuse → resubmit → refuse counts each refusal once, including repeated clicks',()=>{
 const m=meta();solicitarConclusaoMeta(m,ana,'s1',dia(1));assert.equal(totalRecusasMeta(m),0);
 assert.equal(recusarConclusaoMeta(m,diretor,'Ajustar planta','r1',dia(2)),true);
 assert.equal(recusarConclusaoMeta(m,diretor,'Duplo clique','r2',dia(2)),false);
 assert.equal(totalRecusasMeta(m),1);solicitarConclusaoMeta(m,ana,'s2',dia(3));assert.equal(totalRecusasMeta(m),1);
 assert.equal(solicitarConclusaoMeta(m,ana,'s-duplicada',dia(3)),false);
 recusarConclusaoMeta(m,diretor,'Ajustar assinatura','r2',dia(4));assert.equal(totalRecusasMeta(m),2);
 assert.equal(totalRecusasUsuario([m],ana.id),2);assert.equal(totalRecusasUsuario([m],diretor.id),0);
 m.status='Concluído';assert.equal(totalRecusasMeta(m),2);
});
test('multiple assignees and reassignment do not transfer or multiply refusals',()=>{
 const m=meta();solicitarConclusaoMeta(m,ana,'s1',dia(1));recusarConclusaoMeta(m,diretor,'Ajustar','r1',dia(2));m.responsaveis=['bia'];
 solicitarConclusaoMeta(m,bia,'s2',dia(3));recusarConclusaoMeta(m,diretor,'Ajustar','r2',dia(4));
 assert.equal(totalRecusasUsuario([m],ana.id),1);assert.equal(totalRecusasUsuario([m],bia.id),1);
});
test('only the director can refuse pending approval and a reason is required',()=>{
 const m=meta();assert.throws(()=>solicitarConclusaoMeta(m,diretor,'s',dia(1)),/permissão/);
 assert.throws(()=>solicitarConclusaoMeta(m,{...ana,id:'outro'},'s',dia(1)),/permissão/);
 solicitarConclusaoMeta(m,ana,'s',dia(1));assert.throws(()=>recusarConclusaoMeta(m,ana,'motivo','r',dia(2)),/Diretoria/);
 assert.throws(()=>recusarConclusaoMeta(m,diretor,' ','r',dia(2)),/motivo/);assert.equal(totalRecusasMeta(m),0);
});
test('explicit legacy refusals count, with unambiguous requester attribution only',()=>{
 const m=meta();m.historico=[{id:'r',acao:'Conclusão recusada',data:dia(2)},{id:'s',acao:'Conclusão solicitada',autor:'Ana',data:dia(1)}];
 assert.equal(totalRecusasMeta(m),1);assert.equal(totalRecusasUsuario([m],ana.id,[ana,bia]),1);
 assert.equal(totalRecusasUsuario([m],ana.id,[ana,{...bia,nome:'Ana'}]),0);
 m.historico=[{id:'e',acao:'Editada',descricao:'status Em andamento',data:dia(2)}];assert.equal(totalRecusasMeta(m),0);
});
test('unknown historical requester never becomes the current assignee',()=>{
 const m=meta();m.status='Aguardando aprovação';recusarConclusaoMeta(m,diretor,'Ajustar','r',dia(1),[ana]);
 assert.equal(totalRecusasMeta(m),1);assert.equal(totalRecusasUsuario([m],ana.id,[ana]),0);
});
test('totals aggregate across metas, including completed metas',()=>{
 const a=meta(),b=meta();for(const [i,m] of [a,b].entries()){solicitarConclusaoMeta(m,ana,'s'+i,dia(1));recusarConclusaoMeta(m,diretor,'Ajustar','r'+i,dia(2));}a.status='Concluído';assert.equal(totalRecusasUsuario([a,b],ana.id),2);
});
function apply(base,ops){const b=copy(base);for(const op of ops){assert(!op.action);const rows=b[op.table]||=[];const index=rows.findIndex(r=>Object.entries(op.key).every(([k,v])=>r[k]===v));if(op.insert)rows.push({...op.key,...op.changes,created_at:dia(10)});else Object.assign(rows[index],op.changes);}return b;}
test('requester and refusal persist through shared-data writes and a cold reload without duplicate counts',()=>{
 const b=fixture();b.profiles.push({id:id(70),nome:'Ana',tipo:'Topografia',ativo:true});b.meta_responsaveis=[{meta_id:id(7),usuario_id:id(70)}];
 let state=projetar(b,blank());let next=copy(state.db);const agent=next.usuarios.find(u=>u.erpRef===id(70));
 solicitarConclusaoMeta(next.metas[0],agent,id(201),dia(1));
 let updated=apply(state.base,prepararEdicao(state.db,next,state,agent));state=projetar(updated,blank());
 assert.equal(state.db.metas[0].solicitacaoConclusao.solicitanteId,agent.id);
 next=copy(state.db);const admin=next.usuarios.find(u=>u.erpRef===id(1));recusarConclusaoMeta(next.metas[0],admin,'Revisar lote',id(202),dia(2),next.usuarios);
 const ops=prepararEdicao(state.db,next,state,admin);
 assert(ops.some(op=>op.table==='meta_historico'));assert(ops.some(op=>op.table==='integracao_metas'));
 updated=apply(state.base,ops);const cold=projetar(updated,blank());
 assert.equal(totalRecusasMeta(cold.db.metas[0]),1);assert.equal(totalRecusasUsuario(cold.db.metas,agent.id,cold.db.usuarios),1);
 assert.deepEqual(prepararEdicao(cold.db,copy(cold.db),cold,admin),[]);
});
