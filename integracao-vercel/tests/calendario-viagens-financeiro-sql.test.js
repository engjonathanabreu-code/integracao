import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const ativo='00000000-0000-0000-0000-000000000001',outro='00000000-0000-0000-0000-000000000002',inativo='00000000-0000-0000-0000-000000000003';
const sql=readFileSync(new URL('../supabase/operacoes/calendario-viagens-financeiro.sql',import.meta.url),'utf8');
const request=(id='r1')=>({id,category:'trip',convertedId:'t'+id,status:'Aprovada',reviewedAt:'2026-11-18',vehicleId:'hb20',requesterId:ativo,neededAt:'2026-11-13',description:'PRIVATE',estimatedValue:999});
const trip=(id='r1')=>({id:'t'+id,invoiceRequestId:id,start:'2026-11-17',end:'2026-11-19',status:'Planejada',report:'PRIVATE'});
async function banco(){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema erp_collab_private;create schema financeiro_solicitacoes_privado;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,nome text,ativo boolean);
 insert into profiles values('${ativo}','Pessoa Um',true),('${outro}','Pessoa Dois',true),('${inativo}','Inativo',false);
 create function erp_collab_private.active_user() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo)$$;
 create table financeiro_estado_modulos(chave text primary key,dados jsonb);alter table financeiro_estado_modulos enable row level security;
 create table financeiro_veiculos(id text primary key);insert into financeiro_veiculos values('hb20'),('gol');
 create table financeiro_solicitacoes_privado.estado(solicitacao_id text primary key,situacao text,excluida_em timestamptz,arquivada_em timestamptz);
 `);await db.exec(sql);return db;}
async function seed(db,requests=[request()],trips=[trip()]){await db.exec('reset role');for(const [key,data] of [['invoiceRequests',requests],['trips',trips]])await db.query(`insert into financeiro_estado_modulos values($1,$2::jsonb) on conflict(chave) do update set dados=excluded.dados`,[key,JSON.stringify(data)]);}
async function login(db,id=ativo,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`);}
const ler=async db=>(await db.query('select id,solicitacao_id,veiculo_id,solicitante_id,solicitante_nome,inicio::text,fim::text,status from public.integracao_viagens_financeiro()')).rows;
test('projeção SQL compartilha somente disponibilidade mínima e não modifica fonte nem permite acesso financeiro',async()=>{
 const db=await banco();try{await seed(db);await login(db,outro);const rows=await ler(db);assert.equal(rows.length,1);assert.equal(rows[0].solicitante_id,ativo);assert.equal(rows[0].inicio,'2026-11-17');assert.equal(rows[0].fim,'2026-11-19');assert.equal(rows[0].status,'ativo');assert.deepEqual(Object.keys(rows[0]).sort(),['id','solicitacao_id','veiculo_id','solicitante_id','solicitante_nome','inicio','fim','status'].sort());assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
 await assert.rejects(db.query('select * from financeiro_estado_modulos'),e=>e.code==='42501');assert.deepEqual(await ler(db),rows);await db.exec('reset role');assert.deepEqual((await db.query("select dados from financeiro_estado_modulos where chave='invoiceRequests'")).rows[0].dados,[request()]);
 for(const id of ['',inativo,'00000000-0000-0000-0000-000000000099']){await login(db,id);await assert.rejects(ler(db),e=>e.code==='42501');}
 await login(db,ativo,'anon');await assert.rejects(ler(db),e=>e.code==='42501');
 }finally{await db.close();}
});
test('aprovação, período, veículo, cancelamento, arquivamento, conclusão e repetição são derivados da fonte',async()=>{
 const db=await banco();try{
 await seed(db);await login(db);const id=(await ler(db))[0].id;
 await seed(db,[{...request(),vehicleId:'gol'}],[{...trip(),start:'2026-11-20',end:'2026-11-21'}]);await login(db);let rows=await ler(db);assert.equal(rows[0].id,id);assert.equal(rows[0].veiculo_id,'gol');assert.equal(rows[0].inicio,'2026-11-20');
 await db.exec('reset role');await db.exec("insert into financeiro_solicitacoes_privado.estado(solicitacao_id,arquivada_em) values('r1',now())");await login(db);assert.equal((await ler(db)).length,1,'arquivar não cancela');
 for(const state of ['Cancelada','Devolvida']){await db.exec('reset role');await db.query("update financeiro_solicitacoes_privado.estado set situacao=$1",[state]);await login(db);assert.deepEqual(await ler(db),[]);}
 await db.exec('reset role');await db.exec('update financeiro_solicitacoes_privado.estado set situacao=null,excluida_em=now()');await login(db);assert.deepEqual(await ler(db),[]);
 await db.exec('reset role');await db.exec('delete from financeiro_solicitacoes_privado.estado');await seed(db,[request()],[{...trip(),status:'Concluída'}]);await login(db);assert.equal((await ler(db))[0].status,'concluido');
 await seed(db,[],[]);await login(db);assert.deepEqual(await ler(db),[]);
 }finally{await db.close();}
});
test('dados ambíguos, sem aprovação, vínculo inválido ou período incorreto não viram eventos',async()=>{
 const db=await banco();try{
 const cases=[
 [[request(),request()],[trip()]],[[request()],[trip(),trip()]],[[request(),{...request('r2'),convertedId:'tr1'}],[trip()]],
 [[request()],[trip(),{...trip(),id:'t2'}]],[[request()],[]],[[request()],[{...trip(),invoiceRequestId:'wrong'}]],
 [[{...request(),requesterId:'not-a-uuid'}],[trip()]],[[{...request(),vehicleId:'unknown'}],[trip()]],[[{...request(),vehicleId:null}],[trip()]],
 [[{...request(),status:'Rejeitada'}],[trip()]],[[{...request(),reviewedAt:''}],[trip()]],[[request()],[{...trip(),status:'Cancelada'}]],
 [[request()],[{...trip(),vehicleId:'gol'}]],[[request()],[{...trip(),start:'2026-02-30'}]],[[request()],[{...trip(),end:'2026-11-16'}]],
 [[request()],[{...trip(),end:''}]],[[request()],[{...trip(),start:'infinity'}]],[[request()],[{...trip(),status:'Unknown'}]]
 ];for(const [r,t] of cases){await seed(db,r,t);await login(db);assert.deepEqual(await ler(db),[],JSON.stringify([r,t]));}
 await seed(db,[request()],[{...trip(),start:'',end:''}]);await login(db);const [row]=await ler(db);assert.equal(row.inicio,'2026-11-13');assert.equal(row.fim,'2026-11-13');
 }finally{await db.close();}
});

test('rollback remove apenas a API de projeção e preserva dados',async()=>{const db=await banco();try{await seed(db);const before=(await db.query('select * from financeiro_estado_modulos order by chave')).rows;await db.exec(readFileSync(new URL('../supabase/rollback/calendario-viagens-financeiro.sql',import.meta.url),'utf8'));assert.deepEqual((await db.query('select * from financeiro_estado_modulos order by chave')).rows,before);assert.equal((await db.query("select to_regprocedure('public.integracao_viagens_financeiro()') f")).rows[0].f,null);}finally{await db.close();}});
