import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const U=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sql=`create role anon; create role authenticated;
 create schema auth; create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema integracao_crm_privado;
 create schema integracao_atribuicoes_privado;
 create table public.perfil(id uuid primary key, crm boolean not null, ativo boolean not null, editar boolean not null);
 create table public.integracao_moradores(colecao text,registro_id uuid,referencia_tabela text,referencia_id uuid,
 registro_permitido uuid[],dados jsonb, primary key(colecao,registro_id));
 create table public.integracao_crm_cards(id uuid primary key,cliente_id uuid unique,status text not null
 check(status in ('Cliente novo','Cliente Ativo')),responsavel_id uuid,arquivado_em timestamptz);
 create function integracao_crm_privado.permite(modulo text) returns boolean language sql stable security definer
 as $$select exists(select 1 from public.perfil where id=auth.uid() and ativo and crm)$$;
 create function integracao_crm_privado.card_permitido(card uuid) returns boolean language sql stable security definer
 as $$select exists(select 1 from public.integracao_crm_cards where id=card and responsavel_id=auth.uid() and arquivado_em is null)
 and integracao_crm_privado.permite('crm')$$;
 create function integracao_atribuicoes_privado.permitido(recurso text,acao text) returns boolean language sql stable security definer
 as $$select exists(select 1 from public.perfil where id=auth.uid() and ativo and editar)$$;
 alter table public.integracao_moradores enable row level security;
 alter table public.integracao_crm_cards enable row level security;
 create policy cadastro on public.integracao_moradores for all to authenticated
 using(auth.uid()=any(registro_permitido)) with check(auth.uid()=any(registro_permitido));
 create policy crm on public.integracao_crm_cards for all to authenticated using(integracao_crm_privado.card_permitido(id));
 grant usage on schema auth,integracao_crm_privado to authenticated;
 grant select,update on public.integracao_moradores,public.integracao_crm_cards to authenticated;
 insert into public.perfil values ('${U(1)}',true,true,true),('${U(2)}',true,true,true),
 ('${U(3)}',false,true,true),('${U(4)}',true,true,false),('${U(5)}',true,false,true);
 insert into public.integracao_moradores values('processos','${U(20)}','fin_receb_clientes','${U(21)}',
 array['${U(1)}','${U(2)}','${U(3)}','${U(4)}','${U(5)}']::uuid[],'{"requerente":{"statusCRM":"Cliente novo"}}'),
 ('processos','${U(30)}','fin_receb_clientes','${U(31)}',array['${U(2)}']::uuid[],'{"requerente":{"statusCRM":"Cliente novo"}}');
 insert into public.integracao_crm_cards values
 ('${U(22)}','${U(21)}','Cliente novo','${U(2)}',null),('${U(32)}','${U(31)}','Cliente novo','${U(2)}',null),
 ('${U(42)}','${U(41)}','Cliente novo','${U(2)}',null);`;

test('espelha status sem autoria própria, sem liberar a ficha de outro comercial',async()=>{
 const db=new PGlite();
 const u=(n,valor='Cliente Ativo',id=20)=>`update public.integracao_moradores set dados=jsonb_set(dados,'{requerente,statusCRM}',to_jsonb('${valor}'::text)) where registro_id='${U(id)}' returning registro_id`;
 const actor=async(n)=>db.exec(`reset role; select set_config('request.jwt.claim.sub','${n?U(n):''}',false); set role authenticated`);
 const status=async(id)=>{await db.exec('reset role');return (await db.query('select status from public.integracao_crm_cards where id=$1',[U(id)])).rows[0].status};
 try{
  await db.exec(sql);
  const original=await readFile(new URL('../supabase/migrations/20260919141332_consolidacao_crm_funcionalidades.sql',import.meta.url),'utf8');
  const ddl=original.slice(original.indexOf('create function integracao_crm_privado.sincronizar_status()'),original.lastIndexOf('commit;'));
  await db.exec(ddl);
  await actor(1);
  await assert.rejects(db.query(u(1)),/responsável ou administrador/);
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/migrations/20261125184230_crm_status_pelo_cadastro_autorizado.sql',import.meta.url),'utf8'));
  for(const n of [3,4,5]){await actor(n);await assert.rejects(db.query(u(n)),/exige permissão/);}
  await actor(1);
  assert.equal((await db.query(u(1,'Cliente Ativo',30))).rows.length,0);
  assert.equal((await db.query('select id from public.integracao_crm_cards')).rows.length,0);
  assert.equal((await db.query("update public.integracao_crm_cards set status='Cliente Ativo' returning id")).rows.length,0);
  await assert.rejects(db.query(u(1,'Não é um status')),/check constraint/);
  assert.equal(await status(22),'Cliente novo');
  await actor(1);
  await assert.rejects(db.query(`update public.integracao_moradores set referencia_id='${U(41)}',dados='{"requerente":{"statusCRM":"Cliente Ativo"}}' where registro_id='${U(20)}'`),/exige permissão/);
  assert.equal(await status(42),'Cliente novo');
  await actor(1);
  assert.equal((await db.query(u(1))).rows.length,1);
  assert.equal(await status(22),'Cliente Ativo');
  assert.equal(await status(32),'Cliente novo');
  await actor(2);
  await db.query(`update public.integracao_crm_cards set status='Cliente novo' where id='${U(22)}'`);
  assert.equal((await db.query(`select dados#>>'{requerente,statusCRM}' as status from public.integracao_moradores where registro_id='${U(20)}'`)).rows[0].status,'Cliente novo');
  await db.exec(`reset role; update public.integracao_crm_cards set arquivado_em=now() where id='${U(22)}'`);
  await actor(1);await assert.rejects(db.query(u(1)),/indisponível/);
  assert.equal(await status(22),'Cliente novo');
  await db.exec(`update public.integracao_crm_cards set arquivado_em=null where id='${U(22)}';
    insert into public.integracao_moradores select colecao,'${U(50)}',referencia_tabela,referencia_id,registro_permitido,dados from public.integracao_moradores where registro_id='${U(20)}';`);
  await actor(1);await assert.rejects(db.query(u(1)),/exige permissão/);
  assert.equal(await status(22),'Cliente novo');
 }finally{await db.close()}
});
