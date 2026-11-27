import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=(p)=>readFile(new URL('../supabase/'+p,import.meta.url),'utf8');
test('Clientes: políticas permissivas legadas ficam intactas, Consulta não edita, e financeiro não é ampliado',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
     'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth to authenticated,anon;
    create table profiles(id uuid primary key,tipo text,setor text,ativo bool);
    create table fin_receb_clientes(id int primary key,nome text,valor_global numeric,valor_entrada numeric,numero_parcelas int,valor_parcela numeric,primeiro_vencimento date,dia_vencimento int);
    grant select on profiles to authenticated;
    grant select,insert,update,delete on fin_receb_clientes to authenticated;
    alter table fin_receb_clientes enable row level security;
    create policy antigo_editor_crm on fin_receb_clientes for update to authenticated using(true) with check(true);
    create policy leitura_legada on fin_receb_clientes for select to authenticated using(true);
    create policy criacao_legada on fin_receb_clientes for insert to authenticated with check(true);
    insert into fin_receb_clientes values(1,'Original',100,10,3,30,null,10);
    insert into profiles values
      ('00000000-0000-0000-0000-000000000001','Consulta',null,true),
      ('00000000-0000-0000-0000-000000000002','Topografia',null,true),
      ('00000000-0000-0000-0000-000000000003','Atendimentos',null,true),
      ('00000000-0000-0000-0000-000000000004','Administrativo','Financeiro',true),
      ('00000000-0000-0000-0000-000000000005','Comercial',null,false);
  `);
  const as=async(n)=>{await pg.exec('reset role; set role authenticated; set request.jwt.claim.sub = \'00000000-0000-0000-0000-00000000000'+n+'\';');};
  await pg.exec(await sql('migrations/20261125190000_clientes_edicao_sem_perfil_consulta.sql'));
  await pg.exec(await sql('migrations/20261125190100_clientes_valores_contrato_restritos.sql'));
  const atualizar=()=>pg.query("update fin_receb_clientes set nome='editado' where id=1 returning id");
  await as(1);assert.equal((await pg.query('select * from fin_receb_clientes')).rows.length,1);assert.equal((await atualizar()).rows.length,0);
  await pg.query("insert into fin_receb_clientes (id,nome) values (2,'criação legada')");
  await as(2);assert.equal((await atualizar()).rows.length,1);
  await assert.rejects(pg.query("update fin_receb_clientes set valor_global=101 where id=1"),e=>e.code==='42501');
  await as(3);await pg.query('update fin_receb_clientes set valor_global=102 where id=1');
  await as(4);await pg.query('update fin_receb_clientes set dia_vencimento=11 where id=1');
  await as(5);assert.equal((await atualizar()).rows.length,0);
  await pg.exec('reset role');
  await pg.exec(await sql('operacoes/clientes-valores-contrato-restritos-reversao.sql'));
  await pg.exec(await sql('operacoes/clientes-edicao-sem-perfil-consulta-reversao.sql'));
  await as(1);assert.equal((await atualizar()).rows.length,1);
  assert.deepEqual((await pg.query('select valor_global,dia_vencimento from fin_receb_clientes where id=1')).rows,[{valor_global:'102',dia_vencimento:11}]);
 }finally{await pg.close();}
});
