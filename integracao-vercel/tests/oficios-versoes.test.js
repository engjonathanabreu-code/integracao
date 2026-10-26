import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admin,func,banco,como,rpc,arquivo} from './oficios-db-fixture.js';
import {oficioAtual,dadosNovaVersao} from '../src/oficios-versoes.js';
export const migracao=()=>readFileSync(new URL('../supabase/migrations/20261026184153_oficios_versoes.sql',import.meta.url),'utf8');
const atualizar=(db,u,d)=>como(db,u,"select integracao_oficios_operar('atualizar',$1) r",[JSON.stringify(d)]).then(r=>r[0].r);
const versoes=async(db,id)=>(await db.query('select to_jsonb(v) r from integracao_oficios_versoes v where oficio_id=$1 order by versao desc',[id])).rows.map(x=>x.r);
async function preparar(){const db=await banco();const r=await rpc(db,admin,await arquivo(db));await db.exec(migracao());return {db,r};}
test('snapshot preserva v1 integral; v2/v3 mantêm vínculo, autor, datas, arquivos e sequência',async()=>{
 const {db,r}=await preparar();try{
  const [v1]=await versoes(db,r.id);const {oficio_id,versao,...snapshot}=v1;
  const {ano,numero,...original}=r;assert.deepEqual(snapshot,original);assert.equal(oficio_id,r.id);assert.equal(versao,1);
  const d={...dadosNovaVersao(oficioAtual(r),crypto.randomUUID()),resumo:'Novas informações da segunda versão.'};
  const v2=await atualizar(db,admin,d);assert.equal(v2.versao,2);assert.equal(v2.data_envio,null);
  await db.exec(`update profiles set tipo='Jurídico' where id='${func}'`);
  const novo=await arquivo(db);novo.caminho=novo.caminho.replace(admin,func);
  await como(db,func,"insert into storage.objects values('integracao-oficios',$1)",[novo.caminho]);
  const v3=await atualizar(db,func,{...dadosNovaVersao(oficioAtual({...r,versoes:[v2,v1]}),novo.pedido),...novo,data_envio:null,resumo:'Terceira versão com arquivo novo.'});
  assert.equal(v3.versao,3);assert.equal(v3.autor,func);assert.ok(v3.criado_em);assert.equal(v3.data_envio,null);
  assert.deepEqual(await versoes(db,r.id),[v3,v2,v1]);
  assert.deepEqual((await db.query('select to_jsonb(o) r from integracao_oficios o')).rows.map(x=>x.r),[r]);
  assert.equal((await db.query('select ultimo from integracao_oficios_sequencias')).rows[0].ultimo,42);
  const atual=oficioAtual({...r,versoes:[v1,v3,v2]});assert.equal(atual.versao,3);assert.equal(atual.id,r.id);assert.equal(atual.versao_id,v3.id);assert.equal(atual.caminho,novo.caminho);
  assert.equal((await como(db,admin,"select * from storage.objects where name=$1",[v3.caminho])).length,1);
  assert.equal((await como(db,func,"select * from storage.objects where name=$1",[v1.caminho])).length,1);
  assert.equal((await rpc(db,admin,await arquivo(db,43))).numero,43);
  assert.equal((await db.query('select count(*) n from integracao_oficios_versoes where versao=1')).rows[0].n,2);
 }finally{await db.close();}
});
test('repetição devolve a mesma versão; concorrente com base antiga é recusado e não perde dados',async()=>{
 const {db,r}=await preparar();try{
  const d=dadosNovaVersao(oficioAtual(r),crypto.randomUUID()),outro={...d,pedido:crypto.randomUUID(),resumo:'Outro editor'};
  const v2=await atualizar(db,admin,d);assert.deepEqual(await atualizar(db,admin,d),v2);
  await assert.rejects(()=>atualizar(db,admin,outro),/recebeu outra versão/);
  assert.equal((await versoes(db,r.id)).length,2);
  const v3=await atualizar(db,admin,{...outro,base_id:v2.id});assert.equal(v3.versao,3);
  assert.deepEqual(await atualizar(db,admin,d),v2); // resposta perdida e repetida depois de v3
  assert.equal((await versoes(db,r.id)).length,3);
  assert.match(migracao(),/where id=oficio for update/); // PGlite usa uma única conexão, não simula locks entre sessões.
 }finally{await db.close();}
});
test('permissões existentes, imutabilidade, metadados e status não podem ser burlados',async()=>{
 const {db,r}=await preparar();try{
  const d=dadosNovaVersao(oficioAtual(r),crypto.randomUUID());
  await assert.rejects(()=>atualizar(db,func,d),/Sem permissão/);
  await assert.rejects(()=>atualizar(db,admin,{...d,data_envio:'2025-01-10'}),/não registra envio/);
  await assert.rejects(()=>atualizar(db,admin,{...d,nome_arquivo:'alterado.pdf'}),/metadados/);
  await assert.rejects(()=>atualizar(db,admin,{...d,caminho:`${func}/${d.pedido}/oficio.pdf`}),/Anexe/);
  await assert.rejects(()=>atualizar(db,admin,{...d,assunto:''}));
  assert.equal((await versoes(db,r.id)).length,1);
  for(const t of ['integracao_oficios','integracao_oficios_versoes']){
   await assert.rejects(()=>como(db,admin,`update ${t} set resumo='alterado'`),/permission denied/);
   await assert.rejects(()=>db.exec(`update ${t} set resumo='alterado'`),/imutáveis/);
   await assert.rejects(()=>db.exec(`delete from ${t}`),/imutáveis/);
  }
  await assert.rejects(()=>como(db,admin,"select integracao_oficios_operar('resumo',$1)",[JSON.stringify({id:r.id,resumo:'perder histórico'})]),/nova versão/);
  await assert.rejects(()=>como(db,admin,"select integracao_crm_privado.oficio_registrar_v1('resumo','{}')"),/permission denied/);
  await db.exec('grant update,delete on storage.objects to authenticated');
  assert.equal((await como(db,admin,"update storage.objects set name='substituido' returning *")).length,0);
  assert.equal((await como(db,admin,'delete from storage.objects returning *')).length,0);
  await como(db,func,'select * from integracao_oficios_versoes');
  await db.exec(`update profiles set ativo=false where id='${func}'`);
  assert.equal((await como(db,func,'select * from integracao_oficios_versoes')).length,0);
  await assert.rejects(()=>atualizar(db,func,d),/Sessão ativa/);
  assert.deepEqual((await db.query('select to_jsonb(o) r from integracao_oficios o')).rows.map(x=>x.r),[r]);
 }finally{await db.close();}
});
test('rollback operacional pausa atualizações preservando histórico, leitura e novos cadastros v1',async()=>{
 const {db,r}=await preparar();try{
  const v2=await atualizar(db,admin,dadosNovaVersao(oficioAtual(r),crypto.randomUUID()));
  const antes=await versoes(db,r.id);
  await db.exec(readFileSync(new URL('../supabase/operacoes/oficios-versoes-pausar.sql',import.meta.url),'utf8'));
  await assert.rejects(()=>atualizar(db,admin,{...dadosNovaVersao(oficioAtual({...r,versoes:[v2]}),crypto.randomUUID())}),/pausadas/);
  assert.deepEqual(await versoes(db,r.id),antes);
  assert.equal((await rpc(db,admin,await arquivo(db,43))).numero,43);
  assert.equal((await como(db,func,'select * from integracao_oficios_versoes')).length,3);
 }finally{await db.close();}
});
