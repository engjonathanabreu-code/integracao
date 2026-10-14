import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {administradorDocumental,idPastaDocumental} from '../src/documental-config-regras.js';
const city='b62f14cb-b2ee-55df-aa2f-3154b6fe7d1d';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('controle da UI usa perfil real e não nome, setor ou papel de exemplo',()=>{
 assert.equal(administradorDocumental({nome:'Jonathan',setor:'diretoria',tipoERP:'Projetos'}),false);
 assert.equal(administradorDocumental({tipoERP:'Administrador',ativo:true}),true);
 assert.equal(administradorDocumental({tipoERP:'Administrador',ativo:false}),false);
 assert.equal(administradorDocumental({tipoERP:'Diretor Técnico',ativo:true}),false);
 assert.equal(idPastaDocumental('https://drive.google.com/drive/folders/PastaTeste12345?usp=share_link'),'PastaTeste12345');
 assert.equal(idPastaDocumental('https://outro.com/drive/folders/PastaTeste12345'),'');
 assert.equal(idPastaDocumental('http://drive.google.com/drive/folders/PastaTeste12345'),'');
});
test('SQL exige administrador ativo, conexão, pasta e versão; desligar preserva histórico',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
  create table profiles(id uuid primary key,tipo text,ativo boolean);insert into profiles values('${id(1)}','Administrador',true),('${id(2)}','Projetos',true);
  create function is_erp_admin() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and tipo='Administrador' and ativo)$$;
  create table fin_receb_municipios(id uuid primary key,nome text);insert into fin_receb_municipios values('${city}','Guaratuba'),('${id(10)}','Outro município');
  create table fin_receb_clientes(id uuid primary key,municipio_id uuid,nome text,cpf_cnpj text,codigo text,ativo boolean);insert into fin_receb_clientes values('${id(3)}','${city}','Cliente fictício','52998224725','GUA01',true),('${id(4)}','${id(10)}','Outro cliente','52998224725','OUT01',true);
  create table integracao_crm_conversas(id uuid,card_id uuid,instalacao text,conta_id bigint,conversa_id bigint,identidade_confirmada boolean);
  create table integracao_crm_cards(id uuid,cliente_id uuid);
  create table integracao_moradores(colecao text,registro_id text,referencia_id uuid,dados jsonb,updated_at timestamptz);
  create table integracao_configuracoes(colecao text,registro_id text,dados jsonb);
  grant all on fin_receb_clientes,integracao_crm_conversas,integracao_crm_cards,integracao_moradores,integracao_configuracoes to service_role;`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014170000_documental_guaratuba.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261014173000_documental_pastas_seguras.sql',import.meta.url),'utf8'));
  async function call(who,sql,args=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(who)}';`);try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub;');}}
  await assert.rejects(call(2,'select integracao_documental_ler()'),/administradores/);
  assert.equal((await call(2,'select * from integracao_documental_config')).length,0);
  await assert.rejects(call(1,'select integracao_documental_alternar(true,1)'),/Google Drive/);
  await assert.rejects(call(1,'select integracao_documental_vincular($1,$2)',[id(4),'PastaOutro12345']),/Guaratuba/);
  await call(1,'select integracao_documental_vincular($1,$2)',[id(3),'PastaTeste12345']);
  await db.exec('update integracao_documental_config set pronto=true,checado_em=now()');
  const on=(await call(1,'select integracao_documental_alternar(true,2) estado'))[0].estado;
  assert.equal(on.ativo,true);assert.equal(on.versao,3);
  await db.exec(`insert into integracao_crm_cards values('${id(5)}','${id(3)}');insert into integracao_crm_conversas values('${id(6)}','${id(5)}','chatwoot-cxbqw-u77386.vm.elestio.app',1,55,true);insert into integracao_moradores values('processos','morador-teste','${id(3)}','{"requerente":{"rg":"manual"},"docs":[{"id":"doc-original","status":"validado"}],"etapa":2,"unidades":[{"id":"un-original"}]}',now());`);
  const doc={id:'doc-bot',configVersao:3,origem:'Chatwoot / Google Drive',driveId:'drive-ficticio',status:'recebido',documentalConforme:true,pessoa:'requerente',camposExtraidos:{rg:'troca-indesejada',mae:'Dado documental fictício',cpf:'00000000000'}};
  async function registrar(value){await db.exec('set role service_role');try{return (await db.query('select integracao_documental_registrar($1,1,55,$2,$3) ok',['chatwoot-cxbqw-u77386.vm.elestio.app',id(3),JSON.stringify(value)])).rows[0].ok;}finally{await db.exec('reset role');}}
  assert.equal(await registrar(doc),true);assert.equal(await registrar(doc),false);
  const saved=(await db.query('select dados from integracao_moradores')).rows[0].dados;
  assert.equal(saved.requerente.rg,'manual');assert.equal(saved.requerente.mae,'Dado documental fictício');assert.equal(saved.requerente.cpf,undefined);assert.equal(saved.etapa,2);assert.equal(saved.unidades[0].id,'un-original');assert.equal(saved.docs[0].status,'validado');assert.equal(saved.docs.length,2);
  await assert.rejects(registrar({...doc,id:'outro',status:'validado'}),/recibo/);
  await assert.rejects(call(1,'select integracao_documental_alternar(false,1)'),/outra sessão/);
  await db.exec(`insert into fin_receb_clientes values('${id(7)}','${city}','Segundo cliente fictício','00000000000','GUA02',true)`);
  await assert.rejects(call(1,'select integracao_documental_vincular($1,$2)',[id(7),'PastaTeste12345']),/unique constraint/);
  await call(1,'select integracao_documental_vincular($1,$2)',[id(3),'PastaNova123456']);
  await assert.rejects(registrar({...doc,id:'vinculo-antigo'}),/desligado/);
  await db.exec('update integracao_documental_config set pronto=false');
  const off=(await call(1,'select integracao_documental_alternar(false,4) estado'))[0].estado;
  assert.equal(off.ativo,false);assert.equal(off.pastas,1);
  await assert.rejects(registrar({...doc,id:'apos-desligar'}),/desligado/);
  assert.equal((await db.query('select count(*)::int n from integracao_documental_auditoria')).rows[0].n,4);
  await assert.rejects(call(1,"update integracao_documental_config set ativo=true"),/permission denied/);
  await db.exec(`update profiles set ativo=false where id='${id(1)}'`);
  await assert.rejects(call(1,'select integracao_documental_ler()'),/administradores/);
  await db.exec('set role anon');await assert.rejects(db.query('select integracao_documental_ler()'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
