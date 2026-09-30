import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {prepararBanco} from './crm-schema.test.js';import {editarConciliado} from '../src/edicao-conciliada.js';
const read=p=>readFileSync(new URL('../supabase/'+p,import.meta.url),'utf8');const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('finance and institutions merge independent edits using original validations and permissions',async()=>{const db=await prepararBanco();try{
 await db.exec(`alter table profiles add column setor text;update profiles set setor='Financeiro' where id='${id(1)}';
 alter table fin_receb_clientes add column ativo boolean default true,add column valor_entrada numeric;
 create table integracao_revisoes(modulo text primary key,versao bigint);create function integracao_crm_privado.sinalizar_revisao() returns trigger language plpgsql security definer as $$begin update public.integracao_revisoes set versao=versao+1 where modulo=tg_argv[0];return null;end$$;create table fin_receb_importacoes(id bigint generated always as identity,arquivo_nome text,total_registros int,conciliados int,pendentes int,created_by uuid);
 create table fin_receb_parcelas(id uuid primary key default gen_random_uuid(),cliente_id uuid,numero int,vencimento date,valor_previsto numeric,nosso_numero text,documento text,status text,pago_em date,valor_liquidado numeric,diferenca numeric,ativo boolean);
 alter table fin_receb_parcelas enable row level security;alter table fin_receb_importacoes enable row level security;
 grant all on fin_receb_parcelas,fin_receb_importacoes to authenticated;grant usage on all sequences in schema public to authenticated;
 insert into fin_receb_parcelas values('${id(80)}','${id(20)}',1,'2026-10-10',100,null,null,'Pendente',null,0,0,true);`);
 await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;alter table integracao_moradores add primary key(colecao,registro_id);insert into profiles(id,nome,tipo,ativo) values('${id(7)}','Cris','Comercial',true);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
 create table planos_trabalho(id uuid primary key);create table etapas_plano(id uuid primary key,plano_id uuid,ordem integer);
 create function can_manage_core() returns boolean language sql as $$select auth.uid()='${id(1)}'::uuid$$;
 grant select,update on planos_trabalho,etapas_plano to authenticated;`);
 for(const f of ['crm-leads.sql','crm-lead-responsavel.sql','crm-carregamento.sql'])await db.exec(read('operacoes/'+f));
 for(const f of ['20260922162925_crm_multiplos_comerciais.sql','20260919182005_chatwoot_ia_conexao.sql','20260923122108_crm_followup_dashboard.sql'])await db.exec(read('migrations/'+f));
 await db.exec(read('operacoes/financeiro-compartilhado.sql'));await db.exec(read('migrations/20260923140000_crm_institucionais.sql'));
 await db.exec(read('migrations/20260929202124_ponto_tolerancia_followup_personalizado.sql'));await db.exec('alter table integracao_crm_cards add column arquivado_em timestamptz');
 await db.exec(read('migrations/20260930133924_concorrencia_global_segura.sql').split('DO $patch$')[0]);await db.exec(read('migrations/20260930134347_editores_conciliacao_financeiro_crm.sql'));
 const login=n=>db.exec(`reset role;set request.jwt.claim.sub='${id(n)}';set role authenticated`);
 const fin=(b,l)=>db.query('select integracao_financeiro_editar_conciliado($1,$2,$3)',[id(80),JSON.stringify(b),JSON.stringify(l)]);
 await login(1);await db.query('select integracao_financeiro_editar($1,1,$2)',[id(80),JSON.stringify({multa:2})]);
 await fin({juros:0},{juros:3});let r=(await db.query('select * from fin_receb_parcelas')).rows[0];assert.equal(Number(r.juros),3);assert.equal(Number(r.multa),2);
 const version=r.versao;await fin({juros:0},{juros:3});assert.equal((await db.query('select versao from fin_receb_parcelas')).rows[0].versao,version);
 await assert.rejects(()=>fin({juros:0},{juros:5}),e=>e.code==='PT409');await assert.rejects(()=>fin({juros:3},{juros:-1}),/Confira/);
 await assert.rejects(()=>fin({created_by:id(1)},{created_by:id(2)}),/Campo financeiro/);
 await login(2);await assert.rejects(()=>fin({juros:3},{juros:4}),/consulta/);
 await login(1);await db.query('select integracao_crm_salvar_institucional($1,0,$2,$3,$4,100,$5,$6,$7,1)',[id(90),'Prefeitura Teste','Contato Teste','Produto Teste',id(2),'Em negociação','']);
 await login(2);const save=(b,l)=>db.query('select integracao_crm_institucional_conciliado($1,$2,$3)',[id(90),JSON.stringify(b),JSON.stringify(l)]);
 await save({contato:'Contato Teste'},{contato:'Novo Contato'});await save({produto:'Produto Teste'},{produto:'Novo Produto'});
 r=(await db.query('select * from integracao_crm_institucionais')).rows[0];assert.equal(r.contato,'Novo Contato');assert.equal(r.produto,'Novo Produto');
 await save({contato:'Contato Teste'},{contato:'Novo Contato'});
 await assert.rejects(()=>save({contato:'Contato Teste'},{contato:'Outro Contato'}),e=>e.code==='PT409');
 await assert.rejects(()=>save({status:'Em negociação'},{status:'Perdido'}),/motivo/);
 await login(3);await assert.rejects(()=>save({produto:'Novo Produto'},{produto:'Produto de outra conta'}),/indisponível|sem permissão/);
 await db.exec('reset role');await db.exec(readFileSync(new URL('./fixtures/acoes-concorrencia-producao.sql',import.meta.url),'utf8'));await db.exec(read('migrations/20260930135438_acoes_repetidas_concorrencia.sql'));
 await db.exec(`insert into integracao_crm_cards(id,lead_nome,responsavel_id,comerciais_adicionais) values('${id(82)}','Lead Compartilhado','${id(2)}',array['${id(3)}']::uuid[]);insert into planos_trabalho values('${id(91)}');insert into etapas_plano values('${id(92)}','${id(91)}',0),('${id(93)}','${id(91)}',1);`);
 await login(1);await db.query('select reorder_plan_steps($1,$2,$3)',[id(91),[id(93),id(92)],[id(92),id(93)]]);await db.query('select reorder_plan_steps($1,$2,$3)',[id(91),[id(93),id(92)],[id(92),id(93)]]);
 await assert.rejects(()=>db.query('select reorder_plan_steps($1,$2,$3)',[id(91),[id(92),id(93)],[id(92),id(93)]]),e=>e.code==='40001');
 await login(2);await db.query('select integracao_crm_definir_comerciais($1,$2,$3)',[id(82),[id(2)],[id(2),id(3)]]);await db.query('select integracao_crm_definir_comerciais($1,$2,$3)',[id(82),[id(2),id(3),id(7)],[id(2),id(3)]]);
 r=(await db.query('select * from integracao_crm_funil where id=$1',[id(82)])).rows[0];assert.deepEqual(r.responsaveis_ids,[id(2),id(7)]);
 const follow=(pedido,antes,dias,resumo='')=>db.query('select integracao_crm_followup($1,$2,$3,$4,$5) id',[id(82),id(pedido),antes,dias,resumo]);
 const first=(await follow(94,null,7)).rows[0].id;assert.equal((await follow(95,null,7)).rows[0].id,first);
 await assert.rejects(()=>follow(96,null,8),e=>e.code==='PT409');
 const next=(await follow(97,first,4,'Contato realizado com sucesso.')).rows[0].id;assert.equal((await follow(98,first,4,'Contato realizado com sucesso.')).rows[0].id,next);
 await follow(99,next,2,'Novo contato realizado com sucesso.');assert.equal((await follow(98,first,4,'Contato realizado com sucesso.')).rows[0].id,next);
 assert.equal((await db.query('select count(*)::int n from integracao_crm_followups where card_id=$1',[id(82)])).rows[0].n,3);
 const inst=(pedido,antes,dias,resumo='')=>db.query('select integracao_crm_institucional_followup($1,$2,$3,$4,$5) id',[id(90),id(pedido),antes,dias,resumo]);
 const initialInst=(await db.query("select id from integracao_crm_institucionais_followups where card_id=$1 and status='pendente'",[id(90)])).rows[0].id;
 const followingInst=(await inst(101,initialInst,7,'Contato institucional realizado.')).rows[0].id;assert.equal((await inst(102,initialInst,7,'Contato institucional realizado.')).rows[0].id,followingInst);
 await inst(103,followingInst,4,'Outro contato institucional realizado.');assert.equal((await inst(102,initialInst,7,'Contato institucional realizado.')).rows[0].id,followingInst);
 await assert.rejects(()=>inst(104,initialInst,8,'Outro resumo institucional.'),e=>e.code==='PT409');

 await login(1);await db.query('select integracao_financeiro_importar($1,$2)',[JSON.stringify([{id:id(80),versao:0,anterior:{juros:3},dados:{juros:4}}]),'fixture.csv']);assert.equal(Number((await db.query('select juros from fin_receb_parcelas')).rows[0].juros),4);

 }finally{await db.close();}});
test('CAS editor retries races, reviews divergent fields and invalidates choices if remote changes again',async()=>{
 let remote={x:2,y:1},writes=0;
 const options={anterior:{x:0,y:0},local:{x:1,y:0},ler:async()=>({...remote}),gravar:async novo=>{writes++;remote={...remote,...novo};return remote;}};
 let conflict;try{await editarConciliado(options);}catch(e){conflict=e;}
 assert.equal(writes,0);assert.equal(conflict.conflitos.length,1);remote.x=3;
 let changed;try{await conflict.resolver({[conflict.conflitos[0].chave]:'local'});}catch(e){changed=e;}
 assert.equal(writes,0);assert.equal(changed.conflitos[0].remoto,3);await changed.resolver({[changed.conflitos[0].chave]:'local'});assert.deepEqual(remote,{x:1,y:1});
 remote={x:0,y:1};let race=true;
 await editarConciliado({...options,gravar:async novo=>{if(race){race=false;remote.y=2;const e=new Error('race');e.code='PT409';throw e;}remote={...remote,...novo};return remote;}});assert.deepEqual(remote,{x:1,y:2});
});
