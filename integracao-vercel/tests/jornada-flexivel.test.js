import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
const admin='00000000-0000-4000-8000-000000000001',clt='00000000-0000-4000-8000-000000000002',outro='00000000-0000-4000-8000-000000000003';
async function banco(){const db=new PGlite();await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,ativo boolean,tipo text);insert into profiles values('${admin}',true,'Administrador'),('${clt}',true,'Comercial'),('${outro}',true,'Topografia');grant select on profiles to authenticated;create schema integracao_crm_privado;grant usage on schema integracao_crm_privado to authenticated;create function integracao_crm_privado.permite(text) returns boolean language sql security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;`);await db.exec(readFileSync(new URL('../supabase/operacoes/folha-ponto.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/operacoes/ponto-offline.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/operacoes/ponto-solicitacoes.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/migrations/20260929202319_ponto_tolerancia_cinco_minutos.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('./fixtures/ponto-flexivel-producao.sql',import.meta.url),'utf8'));return db;}
async function como(db,u,sql,params=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${u}';`);try{return(await db.query(sql,params)).rows;}finally{await db.exec('reset role');}}
const rpc=(db,u,acao,dados)=>como(db,u,'select integracao_ponto($1,$2::jsonb) as r',[acao,JSON.stringify(dados)]).then(r=>r[0].r);
async function jornada(db){await db.exec(`insert into integracao_ponto_jornadas(usuario_id,vigencia,vinculo,dias,entrada,saida,intervalo,autor) values('${clt}','2026-01-01','CLT',array[1,2,3,4,5],'08:00','17:00',60,'${admin}');`);}
async function marcas(db,dia,horas){for(let i=0;i<horas.length;i++)await db.query(`insert into integracao_ponto_batidas(id,usuario_id,ocorrido_em,tipo) values(gen_random_uuid(),$1,$2,$3)`,[clt,`${dia}T${horas[i]}:00-03:00`,i%2?'saida':'entrada']);}
import {dadosJornada,cargaEmMinutos,resumoJornada} from '../src/jornada-ponto.js';
const form={vinculo:'CLT',vigencia:'2026-09-30',dias:[1,2,3,4,5],flexivel:true,cargas:['00:00','08:00','08:00','08:00','08:00','06:30','00:00'],entrada:'08:00',saida:'17:00',intervalo:60};
test('configuração envia somente a carga dos dias marcados e permite cargas distintas',()=>{
 const r=dadosJornada(form);assert.deepEqual(r.cargas,[0,480,480,480,480,390,0]);assert.equal(r.entrada,undefined);assert.equal(r.intervalo,undefined);
 assert.equal(cargaEmMinutos('24:00'),1440);for(const s of ['00:00','24:01','08:60','abc','8','-01:00'])assert.throws(()=>cargaEmMinutos(s));
 assert.throws(()=>dadosJornada({...form,dias:[]}));assert.throws(()=>dadosJornada({...form,cargas:[]}));
 const fixa=dadosJornada({...form,flexivel:false});assert.equal(fixa.intervalo,60);assert.equal(fixa.cargas,undefined);assert.equal(dadosJornada({...form,vinculo:'Contrato'}).flexivel,false);
 assert.match(resumoJornada({...r}),/Sex 06:30/);assert.match(resumoJornada(fixa),/08:00–17:00/);
});
test('cálculo flexível conta todo o trabalho em qualquer horário; pausas, déficit, extras e dias sem carga',async()=>{const db=await banco();try{
 await db.query(`insert into integracao_ponto_jornadas(usuario_id,vigencia,vinculo,dias,flexivel,cargas,autor) values($1,'2026-01-01','CLT',array[1,2,3,4,5],true,array[0,480,480,480,480,390,0],$2)`,[clt,admin]);
 const casos=[['2026-01-05',['10:00','14:00','16:00','20:00'],480,480,0,0],['2026-01-06',['05:00','09:00','18:00','22:00'],480,480,0,0],['2026-01-07',['10:00','13:00','14:00','18:30'],480,450,0,-30],['2026-01-08',['10:00','14:00','15:00','20:00'],480,540,60,0],['2026-01-09',['12:00','18:30'],390,390,0,0],['2026-01-10',['09:00','11:00'],0,120,120,0],['2026-01-12',[],480,0,0,-480],['2026-01-13',['09:00'],480,0,0,0]];
 for(const [dia,horas,previsto,trabalhado,extra,saldo] of casos){await marcas(db,dia,horas);const d=(await como(db,clt,'select integracao_crm_privado.ponto_dia($1,$2::date) d',[clt,dia]))[0].d;assert.equal(d.flexivel,true);assert.deepEqual([d.previsto,d.trabalhado,d.extra,d.saldo],[previsto,trabalhado,extra,saldo],dia);assert.equal(d.tolerancia_abonada,0);}
 const d=(await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'})).dias.find(d=>d.dia==='2026-01-08');await rpc(db,admin,'decidir',{usuario_id:clt,dia:d.dia,assinatura:d.assinatura,aprovada:true,motivo:'Prorrogação autorizada'});assert.equal((await rpc(db,clt,'relatorio',{mes:'2026-01-01'})).dias.find(d=>d.dia=== '2026-01-08').saldo,60);
 }finally{await db.close();}});
test('configuração flexível mantém permissões, histórico e batidas offline',async()=>{const db=await banco();try{
 await jornada(db);const hoje=(await db.query(`select (now() at time zone 'America/Sao_Paulo')::date::text d`)).rows[0].d;const config={usuario_id:clt,...dadosJornada({...form,vigencia:hoje})};
 await assert.rejects(()=>rpc(db,clt,'jornada',config),/administradores/);
 await assert.rejects(()=>rpc(db,admin,'jornada',{...config,cargas:[480]}),/sete/);
 await assert.rejects(()=>rpc(db,admin,'jornada',{...config,cargas:[0,0,480,480,480,390,0]}),/maior que zero/);
 await assert.rejects(()=>rpc(db,admin,'jornada',{...config,vinculo:'Contrato'}),/exclusivo/);
 await rpc(db,admin,'jornada',config);const atual=(await rpc(db,clt,'estado')).jornada;assert.equal(atual.flexivel,true);assert.equal(atual.entrada,null);assert.equal(atual.saida,null);
 const antigo=(await rpc(db,clt,'relatorio',{mes:'2026-01-01'})).dias.find(d=>d.dia==='2026-01-05');assert.equal(antigo.flexivel,false);assert.equal(antigo.previsto,480);
 await rpc(db,clt,'bater_offline',{pedido:crypto.randomUUID(),tipo:'entrada',ocorrido_em:hoje+'T00:00:00-03:00',offline:true});
 await assert.rejects(()=>rpc(db,admin,'jornada',config),/amanhã/);
 await assert.rejects(()=>rpc(db,outro,'relatorio',{usuario_id:clt,mes:hoje.slice(0,7)+'-01'}),/permissão/);
 }finally{await db.close();}});
