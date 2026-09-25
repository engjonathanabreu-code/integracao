import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const CHEFE=uuid(1),ANA=uuid(2),BIA=uuid(3),INATIVO=uuid(4),SEM_EMAIL=uuid(5);
const EVENTO=uuid(20),AGENDA=uuid(30),KANBAN=uuid(40);
const migration=readFileSync(new URL('../supabase/migrations/20260924210000_calendario_google_email.sql',import.meta.url),'utf8');

async function banco(antes='') {
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema erp_collab_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,erp_collab_private to anon,authenticated,service_role;
 create table public.profiles(id uuid primary key,nome text not null,email text,tipo text not null default 'Topografia',ativo boolean not null default true,setor text);
 create table public.erp_agendas(id uuid primary key,nome text not null,cor text not null default '#2563b8',created_by uuid not null,created_at timestamptz not null default now());
 create table public.processos_kanban(id uuid primary key,municipio text,estado text);
 create table public.erp_eventos(id uuid primary key,serie_id uuid not null default gen_random_uuid(),titulo text not null,descricao text not null default '',
  inicio timestamptz not null,fim timestamptz not null,agenda_id uuid,entidade_tipo text,entidade_id uuid,participantes uuid[] not null default '{}',
  publico boolean not null default true,recorrencia text not null default 'nenhuma',cor text not null default '#0F5F5B',status text not null default 'ativo',
  created_by uuid not null,created_at timestamptz not null default now());
 insert into public.profiles(id,nome,email,tipo,ativo) values
  ('${CHEFE}','Jonathan Abreu','jonathan@exemplo.com','Administrador',true),
  ('${ANA}','Ana Paula','ana@exemplo.com','Topografia',true),
  ('${BIA}','Bia','bia@exemplo.com','Projetos',true),
  ('${INATIVO}','Saiu da empresa','saiu@exemplo.com','Projetos',false),
  ('${SEM_EMAIL}','Sem e-mail no ERP',null,'Projetos',true);
 insert into public.erp_agendas(id,nome,created_by) values('${AGENDA}','Carro 01','${CHEFE}');
 insert into public.processos_kanban(id,municipio,estado) values('${KANBAN}','Ibirama','SC');
 -- Supabase grants every new public table to the app roles by default; the
 -- migration has to take that back for the three calendar tables.
 alter default privileges in schema public grant all on tables to anon,authenticated;
 alter default privileges in schema public grant all on functions to anon,authenticated;
 grant select,insert,update on all tables in schema public to authenticated;`);
 if(antes)await db.exec(antes);
 await db.exec(migration);
 return db;
}
const criarEvento=(db,extra={})=>db.exec(`insert into public.erp_eventos(id,titulo,inicio,fim,agenda_id,entidade_tipo,entidade_id,participantes,created_by${Object.keys(extra).length?','+Object.keys(extra).join(','):''})
 values('${EVENTO}','Mobilização','2026-10-07T13:00:00Z','2026-10-07T15:00:00Z','${AGENDA}','processo','${KANBAN}',array['${ANA}','${BIA}']::uuid[],'${CHEFE}'${Object.keys(extra).length?','+Object.values(extra).map(v=>`'${v}'`).join(','):''});`);
const fila=async(db,colunas='email,tipo,sequencia')=>(await db.query(`select ${colunas} from public.integracao_calendario_fila order by id`)).rows;
// The session claim and the role have to stick for the whole query, the way a
// PostgREST request arrives; "set local" outside a transaction would be dropped.
const comoUsuario=async(db,id,sql)=>{
 await db.exec(`select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`);
 try {return await db.query(sql);} finally {await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);`);}
};

test('a new event queues one invitation per participant and for whoever created it',async()=>{
 const db=await banco();
 await criarEvento(db);
 const linhas=await fila(db);
 assert.deepEqual(linhas.map(l=>l.email).sort(),['ana@exemplo.com','bia@exemplo.com','jonathan@exemplo.com']);
 assert.ok(linhas.every(l=>l.tipo==='convite'&&l.sequencia===0));
 const [{evento}]=(await db.query('select evento from public.integracao_calendario_fila limit 1')).rows;
 assert.equal(evento.agenda,'Carro 01');
 assert.equal(evento.nucleo,'Ibirama/SC');
 assert.equal(evento.organizador.email,'jonathan@exemplo.com');
 assert.equal(evento.participantes.length,2);
});

test('nobody without an active profile or an e-mail is written into the queue',async()=>{
 const db=await banco();
 await db.exec(`insert into public.erp_eventos(id,titulo,inicio,fim,participantes,created_by)
  values('${uuid(21)}','Reunião','2026-10-08T13:00:00Z','2026-10-08T14:00:00Z',array['${INATIVO}','${SEM_EMAIL}','${ANA}']::uuid[],'${CHEFE}');`);
 assert.deepEqual((await fila(db)).map(l=>l.email).sort(),['ana@exemplo.com','jonathan@exemplo.com']);
});

test('someone who turned invitations off is left out, and the rest still receive',async()=>{
 const db=await banco();
 await comoUsuario(db,ANA,`select * from public.integracao_calendario_assinatura(false,null,false);`);
 await criarEvento(db);
 assert.deepEqual((await fila(db)).map(l=>l.email).sort(),['bia@exemplo.com','jonathan@exemplo.com']);
});

test('a cosmetic edit sends nothing; a real change sends an update with the next sequence',async()=>{
 const db=await banco();
 await criarEvento(db);
 await db.exec(`update public.erp_eventos set cor='#123456',publico=false where id='${EVENTO}';`);
 assert.equal((await fila(db)).length,3);
 await db.exec(`update public.erp_eventos set inicio='2026-10-07T16:00:00Z' where id='${EVENTO}';`);
 const novas=(await fila(db)).slice(3);
 assert.equal(novas.length,3);
 assert.ok(novas.every(l=>l.tipo==='atualizacao'&&l.sequencia===1));
});

test('a participant taken off the event gets a cancellation, the others an update',async()=>{
 const db=await banco();
 await criarEvento(db);
 await db.exec(`update public.erp_eventos set participantes=array['${ANA}']::uuid[] where id='${EVENTO}';`);
 const novas=(await fila(db)).slice(3);
 assert.deepEqual(novas.filter(l=>l.tipo==='cancelamento').map(l=>l.email),['bia@exemplo.com']);
 assert.deepEqual(novas.filter(l=>l.tipo==='atualizacao').map(l=>l.email).sort(),['ana@exemplo.com','jonathan@exemplo.com']);
});

test('cancelling and deleting the event clear it from every calendar exactly once',async()=>{
 const db=await banco();
 await criarEvento(db);
 await db.exec(`update public.erp_eventos set status='cancelado' where id='${EVENTO}';`);
 assert.deepEqual((await fila(db)).slice(3).map(l=>l.tipo),['cancelamento','cancelamento','cancelamento']);
 await db.exec(`update public.erp_eventos set status='ativo' where id='${EVENTO}';`);
 assert.deepEqual((await fila(db)).slice(6).map(l=>l.tipo),['atualizacao','atualizacao','atualizacao']);
 await db.exec(`delete from public.erp_eventos where id='${EVENTO}';`);
 assert.deepEqual((await fila(db)).slice(9).map(l=>l.tipo),['cancelamento','cancelamento','cancelamento']);
 assert.equal((await db.query('select count(*)::int as n from public.integracao_calendario_estado')).rows[0].n,0);
});

test('events already in the ERP are adopted without e-mailing anyone about the past',async()=>{
 const db=await banco(`insert into public.erp_eventos(id,titulo,inicio,fim,participantes,created_by)
  values('${EVENTO}','Reunião antiga','2026-09-01T13:00:00Z','2026-09-01T14:00:00Z',array['${ANA}']::uuid[],'${CHEFE}');`);
 assert.equal((await fila(db)).length,0);
 assert.equal((await db.query('select count(*)::int as n from public.integracao_calendario_estado')).rows[0].n,1);
 await db.exec(`update public.erp_eventos set titulo='Reunião remarcada' where id='${EVENTO}';`);
 assert.deepEqual((await fila(db)).map(l=>l.tipo),['atualizacao','atualizacao']);
});

test('another session time zone, or the same people in another order, is not a change',async()=>{
 const db=await banco();
 await criarEvento(db);
 await db.exec(`set time zone 'America/Sao_Paulo';update public.erp_eventos set participantes=array['${BIA}','${ANA}']::uuid[] where id='${EVENTO}';reset time zone;`);
 assert.equal((await fila(db)).length,3);
 await db.exec(`update public.erp_eventos set participantes=array['${BIA}','${ANA}','${CHEFE}']::uuid[] where id='${EVENTO}';`);
 assert.equal((await fila(db)).length,6);
});

test('an event that arrives already cancelled announces nothing',async()=>{
 const db=await banco();
 await criarEvento(db,{status:'cancelado'});
 assert.equal((await fila(db)).length,0);
 await db.exec(`delete from public.erp_eventos where id='${EVENTO}';`);
 assert.equal((await fila(db)).length,0);
});

test('the queue, the subscriptions and the feed are closed to the app roles',async()=>{
 const db=await banco();
 await criarEvento(db);
 for(const tabela of ['integracao_calendario_fila','integracao_calendario_assinaturas','integracao_calendario_estado'])
  await assert.rejects(()=>comoUsuario(db,ANA,`select * from public.${tabela};`),/permission denied/i,tabela);
 await assert.rejects(()=>comoUsuario(db,ANA,`select * from public.integracao_calendario_feed('x',now(),now());`),/permission denied/i);
 await assert.rejects(()=>comoUsuario(db,ANA,`select * from public.integracao_calendario_resumo(now(),now());`),/permission denied/i);
});

test('each person opens only their own subscription, and regenerating replaces the address',async()=>{
 const db=await banco();
 const primeira=(await comoUsuario(db,ANA,'select * from public.integracao_calendario_assinatura();')).rows[0];
 assert.ok(/^[a-f0-9]{64}$/.test(primeira.token));
 assert.deepEqual([primeira.receber_convites,primeira.receber_resumo],[true,true]);
 const outra=(await comoUsuario(db,BIA,'select * from public.integracao_calendario_assinatura();')).rows[0];
 assert.notEqual(primeira.token,outra.token);
 const denovo=(await comoUsuario(db,ANA,'select * from public.integracao_calendario_assinatura();')).rows[0];
 assert.equal(denovo.token,primeira.token);
 const regerada=(await comoUsuario(db,ANA,'select * from public.integracao_calendario_assinatura(null,null,true);')).rows[0];
 assert.notEqual(regerada.token,primeira.token);
 assert.equal((await db.query('select count(*)::int as n from public.integracao_calendario_assinaturas')).rows[0].n,2);
});

test('an inactive account cannot open a subscription',async()=>{
 const db=await banco();
 await assert.rejects(()=>comoUsuario(db,INATIVO,'select * from public.integracao_calendario_assinatura();'),/Sessão inválida/);
 await assert.rejects(()=>comoUsuario(db,uuid(99),'select * from public.integracao_calendario_assinatura();'),/Sessão inválida/);
});

test('the feed carries only what the person takes part in, and an unknown token carries nothing',async()=>{
 const db=await banco();
 const {token}=(await comoUsuario(db,ANA,'select * from public.integracao_calendario_assinatura();')).rows[0];
 await criarEvento(db);
 await db.exec(`insert into public.erp_eventos(id,titulo,inicio,fim,agenda_id,participantes,created_by)
  values('${uuid(22)}','Só da Bia','2026-10-09T13:00:00Z','2026-10-09T14:00:00Z','${AGENDA}',array['${BIA}']::uuid[],'${CHEFE}');`);
 const linhas=(await db.query(`select nome,evento from public.integracao_calendario_feed('${token}','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')`)).rows;
 assert.deepEqual(linhas.map(l=>l.evento.titulo),['Mobilização']);
 assert.equal(linhas[0].nome,'Ana Paula');
 assert.equal((await db.query(`select count(*)::int as n from public.integracao_calendario_feed('${'0'.repeat(64)}','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')`)).rows[0].n,0);
 assert.equal((await db.query(`select count(*)::int as n from public.integracao_calendario_feed('','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')`)).rows[0].n,0);
});

test('the morning summary groups the day per person and skips who turned it off',async()=>{
 const db=await banco();
 await comoUsuario(db,BIA,'select * from public.integracao_calendario_assinatura(null,false,false);');
 await criarEvento(db);
 const linhas=(await db.query(`select nome,email,eventos from public.integracao_calendario_resumo('2026-10-07T03:00:00Z','2026-10-08T03:00:00Z') order by nome`)).rows;
 assert.deepEqual(linhas.map(l=>l.email).sort(),['ana@exemplo.com','jonathan@exemplo.com']);
 assert.equal(linhas[0].eventos.length,1);
 assert.equal(linhas[0].eventos[0].agenda,'Carro 01');
 assert.equal((await db.query(`select count(*)::int as n from public.integracao_calendario_resumo('2026-10-08T03:00:00Z','2026-10-09T03:00:00Z')`)).rows[0].n,0);
});
