import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
const admin='00000000-0000-4000-8000-000000000001',clt='00000000-0000-4000-8000-000000000002',outro='00000000-0000-4000-8000-000000000003';
async function banco(){const db=new PGlite();await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,ativo boolean,tipo text);insert into profiles values('${admin}',true,'Administrador'),('${clt}',true,'Comercial'),('${outro}',true,'Topografia');grant select on profiles to authenticated;create schema integracao_crm_privado;grant usage on schema integracao_crm_privado to authenticated;create function integracao_crm_privado.permite(text) returns boolean language sql security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;`);await db.exec(readFileSync(new URL('../supabase/operacoes/folha-ponto.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/operacoes/ponto-offline.sql',import.meta.url),'utf8'));return db;}
async function como(db,u,sql,params=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${u}';`);try{return(await db.query(sql,params)).rows;}finally{await db.exec('reset role');}}
const rpc=(db,u,acao,dados)=>como(db,u,'select integracao_ponto($1,$2::jsonb) as r',[acao,JSON.stringify(dados)]).then(r=>r[0].r);
async function jornada(db){await db.exec(`insert into integracao_ponto_jornadas(usuario_id,vigencia,vinculo,dias,entrada,saida,intervalo,autor) values('${clt}','2026-01-01','CLT',array[1,2,3,4,5],'08:00','17:00',60,'${admin}');`);}
async function marcas(db,dia,horas){for(let i=0;i<horas.length;i++)await db.query(`insert into integracao_ponto_batidas(id,usuario_id,ocorrido_em,tipo) values(gen_random_uuid(),$1,$2,$3)`,[clt,`${dia}T${horas[i]}:00-03:00`,i%2?'saida':'entrada']);}
test('jornada, batida do servidor, idempotência, alternância e restrição de acesso',async()=>{const db=await banco();try{
 const hoje=(await db.query(`select (now() at time zone 'America/Sao_Paulo')::date::text d`)).rows[0].d;
 const config={usuario_id:clt,vigencia:hoje,vinculo:'CLT',dias:[1,2,3,4,5],entrada:'08:00',saida:'17:00',intervalo:60};
 await assert.rejects(()=>rpc(db,clt,'jornada',config),/administradores/);await rpc(db,admin,'jornada',config);
 const pedido=crypto.randomUUID(),r=await rpc(db,clt,'bater',{pedido,tipo:'entrada',ocorrido_em:'2020-01-01'});assert.equal(r.tipo,'entrada');assert(!r.ocorrido_em.startsWith('2020'));
 assert.equal((await rpc(db,clt,'bater',{pedido,tipo:'entrada'})).id,r.id);
 await assert.rejects(()=>rpc(db,clt,'bater',{pedido:crypto.randomUUID(),tipo:'saida'}),/30 segundos/);
 await assert.rejects(()=>rpc(db,admin,'bater',{usuario_id:clt,pedido:crypto.randomUUID(),tipo:'saida'}),/própria conta/);
 await assert.rejects(()=>rpc(db,outro,'bater',{pedido:crypto.randomUUID(),tipo:'entrada'}),/CLT/);
 assert.equal((await como(db,outro,'select * from integracao_ponto_batidas')).length,0);
 await assert.rejects(()=>como(db,clt,`insert into integracao_ponto_batidas(id,usuario_id,ocorrido_em,tipo) values(gen_random_uuid(),'${clt}',now(),'saida')`));
 await assert.rejects(()=>rpc(db,admin,'jornada',config),/amanhã/);
 }finally{await db.close();}});
test('pausas, horas extras pendentes, aprovação e banco positivo ou negativo',async()=>{const db=await banco();try{await jornada(db);
 await marcas(db,'2026-01-05',['08:00','10:00','10:15','12:00','12:45','17:30']);
 let r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'}),d=r.dias.find(x=>x.dia==='2026-01-05');assert.equal(d.trabalhado,510);assert.equal(d.extra,30);assert.equal(d.pendente_extra,30);assert.equal(d.saldo,0);
 await rpc(db,admin,'decidir',{usuario_id:clt,dia:d.dia,assinatura:d.assinatura,aprovada:true,motivo:'Prorrogação autorizada'});
 r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'});d=r.dias.find(x=>x.dia==='2026-01-05');assert.equal(d.saldo,30);assert.equal(d.aprovado,30);
 assert.equal(r.dias.find(x=>x.dia==='2026-01-06').saldo,-480);
 await assert.rejects(()=>rpc(db,clt,'decidir',{usuario_id:clt,dia:d.dia,assinatura:d.assinatura,aprovada:true,motivo:'Eu aprovo'}),/administradores/);
 await marcas(db,'2026-01-07',['08:00']);r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'});d=r.dias.find(x=>x.dia==='2026-01-07');assert.equal(d.incompleto,true);assert.equal(d.saldo,0);
 }finally{await db.close();}});
test('revisão preserva originais, invalida aprovação anterior e ajuste acumula no mês seguinte',async()=>{const db=await banco();try{await jornada(db);await marcas(db,'2026-01-05',['08:00','12:00','13:00','18:00']);
 let r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'}),d=r.dias.find(x=>x.dia==='2026-01-05');await rpc(db,admin,'decidir',{usuario_id:clt,dia:d.dia,assinatura:d.assinatura,aprovada:true,motivo:'Entrega autorizada'});
 await rpc(db,admin,'revisar',{usuario_id:clt,dia:d.dia,batidas:['08:00','12:00','13:00','17:30'].map(h=>`2026-01-05T${h}:00-03:00`),motivo:'Correção comprovada'});
 r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'});d=r.dias.find(x=>x.dia==='2026-01-05');assert.equal(d.pendente_extra,30);assert.equal(d.aprovado,0);assert.equal(d.originais.length,4);assert(d.revisao);
 await assert.rejects(()=>rpc(db,admin,'revisar',{usuario_id:clt,dia:d.dia,batidas:['2026-01-05T17:00:00-03:00','2026-01-05T08:00:00-03:00'],motivo:'Fora de ordem'}),/ordem/);
 await rpc(db,admin,'ajustar',{usuario_id:clt,dia:'2026-01-06',minutos:480,motivo:'Abono de ausência'});
 r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'});const saldo=r.dias.reduce((a,d)=>a+d.saldo,0);
 assert.equal((await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-02-01'})).saldo_anterior,saldo);
 }finally{await db.close();}});
test('fim de semana é extra, recusa não credita e alteração de jornada não reescreve passado',async()=>{const db=await banco();try{await jornada(db);await marcas(db,'2026-01-10',['09:00','11:00']);let r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'}),d=r.dias.find(x=>x.dia==='2026-01-10');assert.equal(d.previsto,0);assert.equal(d.extra,120);
 await assert.rejects(()=>rpc(db,admin,'decidir',{usuario_id:clt,dia:d.dia,assinatura:'versao-antiga',aprovada:true,motivo:'Versão antiga'}),/mudaram/);
 await rpc(db,admin,'decidir',{usuario_id:clt,dia:d.dia,assinatura:d.assinatura,aprovada:false,motivo:'Prorrogação não autorizada'});
 r=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'});d=r.dias.find(x=>x.dia==='2026-01-10');assert.equal(d.rejeitado,120);assert.equal(d.saldo,0);
 const hoje=(await db.query(`select (now() at time zone 'America/Sao_Paulo')::date::text d`)).rows[0].d;
 await rpc(db,admin,'jornada',{usuario_id:clt,vigencia:hoje,vinculo:'Contrato',dias:[1,2,3,4,5],entrada:'09:00',saida:'18:00',intervalo:60});
 const antigo=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'});assert.equal(antigo.dias.find(x=>x.dia==='2026-01-06').previsto,480);
 await assert.rejects(()=>rpc(db,clt,'bater',{pedido:crypto.randomUUID(),tipo:'entrada'}),/CLT/);
 await assert.rejects(()=>rpc(db,clt,'relatorio',{usuario_id:admin,mes:'2026-01-01'}),/permissão/);
 await assert.rejects(()=>como(db,clt,`delete from integracao_ponto_batidas where usuario_id='${clt}'`));
 }finally{await db.close();}});

test('offline: horário original, recebimento, repetição, acesso, conflitos e relatório',async()=>{const db=await banco();try{await jornada(db);
 const entrada={pedido:crypto.randomUUID(),tipo:'entrada',ocorrido_em:'2026-01-08T08:00:00-03:00',offline:true};
 const r=await rpc(db,clt,'bater_offline',entrada);assert.equal(r.origem,'offline');assert.equal(Date.parse(r.ocorrido_em),Date.parse(entrada.ocorrido_em));assert(Date.parse(r.recebido_em)>Date.parse(r.ocorrido_em));
 assert.equal((await rpc(db,clt,'bater_offline',entrada)).id,r.id);
 await rpc(db,clt,'bater_offline',{pedido:crypto.randomUUID(),tipo:'saida',ocorrido_em:'2026-01-08T17:00:00-03:00',offline:true});
 const rel=await rpc(db,admin,'relatorio',{usuario_id:clt,mes:'2026-01-01'}),d=rel.dias.find(d=>d.dia==='2026-01-08');assert.equal(d.trabalhado,540);assert.equal(d.pendente_extra,60);assert.equal(d.originais[0].origem,'offline');
 await assert.rejects(()=>rpc(db,outro,'bater_offline',{...entrada,pedido:crypto.randomUUID()}),/CLT/);
 await assert.rejects(()=>rpc(db,admin,'bater_offline',{...entrada,usuario_id:clt}),/própria conta/);
 await assert.rejects(()=>rpc(db,clt,'bater_offline',{...entrada,pedido:crypto.randomUUID(),ocorrido_em:'2099-01-01T08:00:00Z'}),/Horário inválido/);
 await assert.rejects(()=>rpc(db,clt,'bater_offline',{...entrada,pedido:crypto.randomUUID(),ocorrido_em:'2026-01-08T09:00:00-03:00'}),/Conflito/);
 await rpc(db,admin,'revisar',{usuario_id:clt,dia:'2026-01-08',batidas:[],motivo:'Regularização administrativa'});
 await assert.rejects(()=>rpc(db,clt,'bater_offline',{...entrada,pedido:crypto.randomUUID(),ocorrido_em:'2026-01-08T18:00:00-03:00'}),/regularizado/);
 }finally{await db.close();}});
