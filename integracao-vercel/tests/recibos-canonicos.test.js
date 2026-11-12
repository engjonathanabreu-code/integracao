import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {validarReciboOperacoes} from '../src/recibo-operacoes.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration='../supabase/migrations/20261111192443_recibos_canonicos_operacoes.sql';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('recibo aditivo: canônico por operação, rebase, duas contas, RLS, atomicidade, perda de resposta e reversão',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create table profiles(id uuid primary key,ativo boolean);insert into profiles values('${id(1)}',true),('${id(2)}',true),('${id(3)}',false);grant select on profiles to authenticated;
   create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));grant select,insert on integracao_pedidos to authenticated;
   alter table integracao_pedidos enable row level security;create policy own on integracao_pedidos to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());
   create table metas(id uuid primary key,titulo text,dados jsonb,valor numeric,created_at timestamptz default now());grant select,insert,update,delete on metas to authenticated;
   alter table metas enable row level security;create policy active on metas to authenticated using(exists(select 1 from profiles where id=auth.uid() and ativo)) with check(exists(select 1 from profiles where id=auth.uid() and ativo));
   create table erp_eventos(id uuid primary key default gen_random_uuid(),titulo text);grant select,insert on erp_eventos to authenticated;
   create function public.erp_collab_action(acao text,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare novo uuid;begin insert into public.erp_eventos(titulo) values(p->>'titulo') returning id into novo;return jsonb_build_object('id',novo,'titulo',p->>'titulo');end$$;
   create table meta_arquivos(id uuid primary key,titulo text);grant insert on meta_arquivos to authenticated;grant select(id) on meta_arquivos to authenticated;
   create table meta_checklist(id uuid primary key,titulo text);grant select,insert on meta_checklist to authenticated;alter table meta_checklist enable row level security;create policy criar on meta_checklist for insert to authenticated with check(true);create policy ler on meta_checklist for select to authenticated using(titulo<>'oculto');create function esconder_fixture() returns trigger language plpgsql security definer as $$begin update public.meta_checklist set titulo='oculto' where id=new.id;return new;end$$;create trigger esconder after insert on meta_checklist for each row execute function esconder_fixture();`);
  for(const file of ['./fixtures/gravar-antes-leitura.sql',...['20260928161356_chat_leitura_sem_conflito','20260928164241_notificacoes_leitura_sem_conflito','20260929145521_moradores_mesclagem_sem_conflito','20260929162047_modulos_mesclagem_sem_conflito','20260930133924_concorrencia_global_segura','20261110144604_aliases_tipados_gravacao','20261110152928_consulta_recibo_intencao_v2'].map(n=>'../supabase/migrations/'+n+'.sql')])await db.exec(read(file));
  const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
  const send=async(ops,pedido=crypto.randomUUID())=>(await db.query('select public.integracao_gravar($1,$2) r',[JSON.stringify(ops),pedido])).rows[0].r;
  const op=(changes,expected={})=>({table:'metas',key:{id:id(10)},changes,expected});
  await login(1);const legacyOps=[{...op({titulo:'base',dados:{a:0,b:0},valor:10}),insert:true}],legacyId=crypto.randomUUID();const legacy=await send(legacyOps,legacyId);assert.deepEqual(legacy,{aliases:{}});
  await db.exec('reset role');await db.exec(read(migration));await login(1);
  assert.deepEqual(await send(legacyOps,legacyId),legacy,'recibo antigo não é reescrito');
  const pedido=crypto.randomUUID(),ops=[op({titulo:'enviado',valor:12.5},{titulo:'base',valor:10})];const receipt=await send(ops,pedido);
  assert.equal(validarReciboOperacoes(receipt,ops,pedido),true);assert.equal(receipt.resultados[0].canonico.titulo,'enviado');assert.equal(receipt.resultados[0].canonico.valor,12.5);assert.equal(Object.hasOwn(receipt.resultados[0].canonico,'dados'),false);
  await login(2);await send([op({titulo:'posterior'},{titulo:'enviado'})]);
  assert.equal((await db.query('select titulo from metas')).rows[0].titulo,'posterior');
  assert.equal((await db.query('select public.integracao_consultar_pedido($1,$2) r',[JSON.stringify(ops),pedido])).rows[0].r,null,'outra conta não vê recibo');
  await login(1);assert.deepEqual(await send(ops,pedido),receipt,'repetição após resposta perdida devolve recibo original');assert.equal((await db.query('select titulo from metas')).rows[0].titulo,'posterior');
  assert.deepEqual((await db.query('select public.integracao_consultar_pedido($1,$2) r',[JSON.stringify(ops),pedido])).rows[0].r,receipt);
  await assert.rejects(send([op({titulo:'outro'})],pedido),/Pedido já utilizado/);
  await login(2);await send([op({dados:{a:0,b:1}},{dados:{a:0,b:0}})]);await login(1);
  const mergedOps=[op({dados:{a:1,b:0}},{dados:{a:0,b:0}})],merged=await send(mergedOps);assert.deepEqual(merged.resultados[0].canonico.dados,{a:1,b:1});
  const conflictId=crypto.randomUUID();await assert.rejects(send([op({valor:99},{valor:12.5}),op({titulo:'conflito'},{titulo:'base'})],conflictId),{code:'PT409'});
  assert.equal((await db.query('select valor from metas')).rows[0].valor,'12.5');assert.equal((await db.query('select count(*)::int n from integracao_pedidos where pedido=$1',[conflictId])).rows[0].n,0);
  const tmp='evento-temporario',actionOps=[{action:'evento',tempId:tmp,payload:{titulo:tmp}}],actionId=crypto.randomUUID(),action=await send(actionOps,actionId);assert.equal(validarReciboOperacoes(action,actionOps,actionId),true);assert.equal(action.resultados[0].canonico.titulo,tmp);assert.equal(action.resultados[0].canonico.id,action.aliases[tmp]);
  for(const table of ['meta_arquivos','meta_checklist']){const p=crypto.randomUUID(),os=[{table,key:{id:crypto.randomUUID()},insert:true,changes:{titulo:'sem leitura'}}],r=await send(os,p);assert.equal(r.resultados[0].disponivel,false);assert.equal(r.resultados[0].removido,false);assert.equal(r.resultados[0].canonico,null);assert.equal(validarReciboOperacoes(r,os,p),true);}
  const removeId=crypto.randomUUID(),removeOps=[{table:'metas',key:{id:id(10)},remove:true,expected:{titulo:'posterior'}}],removed=await send(removeOps,removeId);assert.equal(validarReciboOperacoes(removed,removeOps,removeId),true);assert.equal(removed.resultados[0].canonico,null);assert.equal(removed.resultados[0].removido,true);
  await login(3);await assert.rejects(send(ops));await db.exec('reset role;set role anon');await assert.rejects(send(ops),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query("select prosecdef from pg_proc where oid='integracao_gravar(jsonb,uuid)'::regprocedure")).rows[0].prosecdef,false);
  await assert.rejects(db.exec(read(migration)),/mudou/,'migration recusa código inesperado ou reaplicação');
  await db.exec(read('../supabase/operacoes/recibos-canonicos-reversao.sql'));
  assert.equal((await db.query("select md5(pg_get_functiondef('integracao_gravar(jsonb,uuid)'::regprocedure)) hash")).rows[0].hash,'9afac4a610b268dec4ea50297b0b2fa3');
  await login(1);assert.deepEqual(await send(ops,pedido),receipt,'reversão de código mantém recibos novos intactos');
  assert.deepEqual(await send([{...op({titulo:'após rollback'}),insert:true}]),{aliases:{}});
 }finally{await db.close();}
});
test('validação do protocolo nunca converte recibo inválido em confirmação e aceita legado sem reinterpretar',()=>{
 const ops=[{table:'metas',key:{id:id(1)},changes:{titulo:'novo'}}],pedido=id(9),r={aliases:{},protocoloRecibo:1,pedido,confirmadoEm:'2026-11-11T12:00:00Z',resultados:[{indice:0,tipo:'registro',tabela:'metas',chave:{id:id(1)},removido:false,canonico:{titulo:'novo'},versao:'a'.repeat(32)}]};
 assert.equal(validarReciboOperacoes({aliases:{}},ops,pedido),false);assert.equal(validarReciboOperacoes(r,ops,pedido),true);
 for(const change of [{protocoloRecibo:2},{pedido:id(8)},{resultados:[]},{confirmadoEm:'invalido'},{resultados:[{...r.resultados[0],indice:1}]},{resultados:[{...r.resultados[0],chave:{id:id(2)}}]},{resultados:[{...r.resultados[0],removido:true}]}])assert.throws(()=>validarReciboOperacoes({...r,...change},ops,pedido),{code:'RECIBO_INVALIDO'});
});

test('retornos canônicos de ações permanecem JSON sem impor formato aos RPCs legados',()=>{
 for(const canonico of [null,true,7,'ok',[],{ok:true}]){
  const op={action:'lida',payload:{}},r={protocoloRecibo:1,aliases:{},pedido:id(1),confirmadoEm:'2026-11-11T00:00:00Z',resultados:[{indice:0,tipo:'acao',acao:'lida',canonico,versao:'a'.repeat(32)}]};
  assert.equal(validarReciboOperacoes(r,[op],id(1)),true);
 }
});
