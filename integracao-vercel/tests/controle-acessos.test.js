import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {diaAcesso,mudarMes,limitesMes,linhasAcessos} from '../src/acessos-regras.js';
test('relatório respeita virada de dia de Brasília, mês e usuário',()=>{
 assert.equal(diaAcesso('2026-10-01T02:59:59Z'),'2026-09-30');
 assert.equal(diaAcesso('2026-10-01T03:00:00Z'),'2026-10-01');
 assert.equal(mudarMes('2026-12',1),'2027-01');assert.equal(mudarMes('2026-01',-1),'2025-12');
 assert.deepEqual(limitesMes('2026-09'),{inicio:'2026-09-01T00:00:00-03:00',fim:'2026-10-01T00:00:00-03:00'});
 const ev=[{usuario_id:'a',usuario_nome:'Ana',evento:'login',ocorrido_em:'2026-10-01T02:00:00Z'},{usuario_id:'a',usuario_nome:'Ana',evento:'logout',ocorrido_em:'2026-10-01T03:00:00Z'}];
 assert.equal(linhasAcessos(ev,'2026-09')[0].login.length,1);assert.equal(linhasAcessos(ev,'2026-10')[0].logout.length,1);assert.equal(linhasAcessos(ev,'2026-09','b').length,0);assert.deepEqual(linhasAcessos(ev,'2027-01'),[]);
});
test('auditoria grava identidade e horário no servidor, evita duplicação e restringe leitura e alterações',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema integracao_crm_privado;grant usage on schema auth,integracao_crm_privado to authenticated;
 create function auth.uid() returns uuid language sql as $$select current_setting('test.uid',true)::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('test.sid',true))$$;
 create table auth.sessions(id uuid,user_id uuid);create table public.profiles(id uuid,nome text,ativo boolean);
 create function integracao_crm_privado.permite(text) returns boolean language sql as $$select auth.uid()='00000000-0000-4000-8000-000000000001'::uuid$$;
 insert into profiles values('00000000-0000-4000-8000-000000000001','Admin',true),('00000000-0000-4000-8000-000000000002','Comercial',true);
 insert into auth.sessions values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002');`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20260920000617_controle_acessos.sql',import.meta.url),'utf8'));
 await db.exec(`set role authenticated;set test.uid='00000000-0000-4000-8000-000000000002';set test.sid='00000000-0000-4000-8000-000000000010';select public.integracao_registrar_acesso('login','autenticacao');select public.integracao_registrar_acesso('login','autenticacao');select public.integracao_registrar_acesso('logout','manual');`);
 assert.equal((await db.query('select * from integracao_acessos')).rows.length,0);
 await assert.rejects(()=>db.exec("insert into integracao_acessos(evento) values('login')"));
 await assert.rejects(()=>db.exec("update integracao_acessos set usuario_nome='Outro'"));await assert.rejects(()=>db.exec('delete from integracao_acessos'));
 await assert.rejects(()=>db.exec("select public.integracao_registrar_acesso('login','manual')"));
 await db.exec(`set test.uid='00000000-0000-4000-8000-000000000001'`);
 const rows=(await db.query('select * from integracao_acessos')).rows;assert.equal(rows.length,2);assert.equal(rows[0].usuario_nome,'Comercial');assert.ok(rows[0].ocorrido_em);
 await assert.rejects(()=>db.exec("select public.integracao_registrar_acesso('login','autenticacao')"));
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from integracao_acessos'));await assert.rejects(()=>db.exec("select public.integracao_registrar_acesso('login','autenticacao')"));
 }finally{await db.close();}
});
