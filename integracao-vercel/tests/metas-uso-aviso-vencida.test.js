import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {avisoMetaVencida,avisosMetasVencidas,registrarAvisosMetasVencidas,metaVencidaParaAviso,idDeterministico} from '../src/metas-uso.js';
import {notificacoesUsuario,notificacaoLida} from '../src/notificacoes-usuario.js';
import {fixture,blank} from './fixture.js';
import {projetar,prepararEdicao,copy} from '../src/dados-compartilhados.js';

const diretor={id:'erp_d',setor:'diretoria',ativo:true},ana={id:'erp_a',setor:'topografia',ativo:true},
 bia={id:'erp_b',setor:'projeto',ativo:true},caio={id:'erp_c',setor:'comercial',ativo:true};
const meta=(extra={})=>({id:'11111111-1111-4111-8111-111111111111',titulo:'Levantar o NUI01',prazo:'2026-11-20',status:'Em andamento',responsaveis:['erp_b','erp_a'],...extra});
const base=(metas=[meta()],notificacoes=[])=>({usuarios:[diretor,ana,bia,caio],metas,notificacoes});
const copia=x=>JSON.parse(JSON.stringify(x));

test('USO-M2: só meta aberta com prazo anterior ao dia civil gera aviso',()=>{
 assert.equal(metaVencidaParaAviso(meta(),'2026-11-21'),true);
 assert.equal(metaVencidaParaAviso(meta(),'2026-11-20'),false,'no dia do prazo ainda não venceu');
 for(const status of ['Concluído','Cancelado','Aguardando aprovação'])assert.equal(metaVencidaParaAviso(meta({status}),'2026-12-01'),false,status);
 assert.equal(metaVencidaParaAviso(meta({prazo:''}),'2026-12-01'),false);
 assert.equal(metaVencidaParaAviso(meta({prazo:'20/11/2026'}),'2026-12-01'),false);
 assert.equal(metaVencidaParaAviso(meta(),''),false);
});

test('USO-M2: o aviso é função só da meta — aparelhos e dias diferentes produzem o mesmo registro',()=>{
 const a=avisoMetaVencida(meta()),b=avisoMetaVencida(copia(meta({responsaveis:['erp_a','erp_b','erp_a']})));
 assert.deepEqual(a,b);
 assert.match(a.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.deepEqual(a,{id:a.id,data:'2026-11-21T03:00:00.000Z',titulo:'Meta vencida: Levantar o NUI01',
  texto:'O prazo era 20/11/2026 e a meta continua aberta.',rota:{pag:'metas'},setores:['diretoria'],usuarios:['erp_a','erp_b']});
 assert.equal('lidaPor' in a,false,'sem lidaPor: nada a divergir do que já foi gravado');
 // O mesmo aviso em qualquer dia posterior e para qualquer destinatário que o gere.
 const ids=new Set();
 for(const hoje of ['2026-11-21','2026-11-22','2026-12-31'])for(const u of [diretor,ana,bia])
  for(const x of avisosMetasVencidas(base(),u,hoje)){assert.deepEqual(x,a);ids.add(x.id);}
 assert.equal(ids.size,1);
 // Prazo, título ou responsáveis novos são outro vencimento/outro público: outro aviso.
 assert.notEqual(avisoMetaVencida(meta({prazo:'2026-11-27'})).id,a.id);
 assert.notEqual(avisoMetaVencida(meta({responsaveis:['erp_a']})).id,a.id);
 assert.notEqual(avisoMetaVencida(meta({id:'22222222-2222-4222-8222-222222222222'})).id,a.id);
 assert.equal(idDeterministico('x'),idDeterministico('x'));assert.notEqual(idDeterministico('x'),idDeterministico('y'));
});

test('USO-M2: quem não é responsável nem Diretoria não gera; aviso já existente não é regerado',()=>{
 assert.deepEqual(avisosMetasVencidas(base(),caio,'2026-12-01'),[]);
 assert.deepEqual(avisosMetasVencidas(base(),{...ana,ativo:false},'2026-12-01'),[]);
 assert.deepEqual(avisosMetasVencidas(null,ana,'2026-12-01'),[]);
 const d=base();
 const avisos=avisosMetasVencidas(d,ana,'2026-12-01');assert.equal(avisos.length,1);
 registrarAvisosMetasVencidas(d,avisos);registrarAvisosMetasVencidas(d,avisos);
 assert.equal(d.notificacoes.length,1,'aplicar duas vezes não duplica');
 assert.deepEqual(avisosMetasVencidas(d,ana,'2026-12-02'),[],'no dia seguinte não há novo aviso');
 assert.deepEqual(avisosMetasVencidas(d,diretor,'2026-12-15'),[],'nem em outro aparelho que já leu o aviso');
 // Chega a quem deve: responsáveis e Diretoria; não lido até cada um marcar.
 for(const u of [diretor,ana,bia]){assert.equal(notificacoesUsuario(d,u).length,1);assert.equal(notificacaoLida(d,d.notificacoes[0],u),false);}
 assert.equal(notificacoesUsuario(d,caio).length,0);
 // Meta repetida na lista gera um aviso só; a lista cheia não é recortada (um aviso
 // antigo cortado pareceria ausente e seria gerado de novo).
 const cheio=base([meta(),meta()],Array.from({length:300},(_,i)=>({id:`n${i}`,usuarios:[],setores:[]})));
 const novos=avisosMetasVencidas(cheio,diretor,'2026-12-01');assert.equal(novos.length,1);
 registrarAvisosMetasVencidas(cheio,novos);assert.equal(cheio.notificacoes.length,301);assert.equal(cheio.notificacoes[0].id,novos[0].id);
 assert.deepEqual(avisosMetasVencidas(cheio,diretor,'2026-12-02'),[]);
});

test('USO-M2: a intenção enviada é uma única inserção do aviso, idêntica entre aparelhos',()=>{
 const estado=projetar(fixture(),blank()),u=estado.db.usuarios[0];
 const operacoes=()=>{const depois=copy(estado.db);registrarAvisosMetasVencidas(depois,[avisoMetaVencida(meta())]);return prepararEdicao(estado.db,depois,estado,u);};
 const ops=operacoes(),aviso=avisoMetaVencida(meta());
 assert.equal(ops.length,1);
 assert.equal(ops[0].table,'integracao_notificacoes');assert.equal(ops[0].insert,true);
 assert.deepEqual(ops[0].key,{colecao:'notificacoes',registro_id:aviso.id});
 assert.deepEqual(ops[0].changes.dados,aviso);
 assert.deepEqual(operacoes(),ops);
});

test('USO-M2: App.jsx só chama o gancho, com a base do servidor carregada e conexão',()=>{
 const fonte=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(fonte,/useAvisosMetasVencidas\(\{ db, usuario, mutar, pronto: AMBIENTE\.DEMO \|\| \(compartilhado\.ready\(\) && compartilhado\.summaryReady && navigator\.onLine !== false\) \}\);/);
 const gancho=fs.readFileSync(new URL('../src/use-avisos-metas-vencidas.js',import.meta.url),'utf8');
 assert.match(gancho,/tentados\.current\.add/);
 assert.match(gancho,/mutar\(d=>registrarAvisosMetasVencidas\(d,avisos\)\)/,'sem rótulo: não cria entrada de auditoria por aparelho');
});

test('USO-M2: no banco, dois aparelhos e duas contas gravando o mesmo aviso deixam uma linha, sem conflito',async()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
 const db=new PGlite();try{
 await db.exec(`create schema auth;create role authenticated;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,ativo boolean);insert into profiles values('${a}',true),('${b}',true);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
 create table integracao_notificacoes(colecao text,registro_id text,dados jsonb,criado_por uuid,updated_at timestamptz,primary key(colecao,registro_id));
 grant usage on schema auth,public to authenticated;grant select on profiles to authenticated;grant select,insert on integracao_pedidos to authenticated;
 grant select,insert,update on integracao_notificacoes to authenticated;
 alter table integracao_pedidos enable row level security;create policy own on integracao_pedidos to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());
 alter table integracao_notificacoes enable row level security;
 create policy ler on integracao_notificacoes for select to authenticated using(true);
 create policy criar on integracao_notificacoes for insert to authenticated with check(criado_por=auth.uid());
 create policy marcar on integracao_notificacoes for update to authenticated using(true) with check(true);`);
 for(const p of ['./fixtures/gravar-antes-leitura.sql','../supabase/migrations/20260928161356_chat_leitura_sem_conflito.sql','../supabase/migrations/20260928164241_notificacoes_leitura_sem_conflito.sql','../supabase/migrations/20260929145521_moradores_mesclagem_sem_conflito.sql','../supabase/migrations/20260929162047_modulos_mesclagem_sem_conflito.sql','../supabase/migrations/20260930133924_concorrencia_global_segura.sql'])await db.exec(read(p));
 const login=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const aviso=avisoMetaVencida(meta());
 const gravar=(conta,dados=aviso)=>db.query('select integracao_gravar($1,$2)',[JSON.stringify([{table:'integracao_notificacoes',key:{colecao:'notificacoes',registro_id:dados.id},insert:true,changes:{criado_por:conta,dados}}]),crypto.randomUUID()]);
 const linhas=async()=>{await db.exec('reset role');return (await db.query('select * from integracao_notificacoes')).rows;};
 await login(a);await gravar(a);            // aparelho 1 da conta A
 await gravar(a);                           // aparelho 2 da mesma conta, outro pedido
 await login(b);await gravar(b);            // outra conta (outro responsável ou diretor)
 let r=await linhas();assert.equal(r.length,1);assert.equal(r[0].criado_por,a);assert.deepEqual(r[0].dados,aviso);
 // Linha que já recebeu marca de leitura (formato antigo) continua aceitando a regravação idêntica.
 await db.query(`update integracao_notificacoes set dados=jsonb_set(dados,'{lidaPor}','["erp_${a}"]')`);
 await login(b);await gravar(b);
 r=await linhas();assert.equal(r.length,1);assert.deepEqual(r[0].dados,{...aviso,lidaPor:[`erp_${a}`]});
 // Contraprova: conteúdo que dependesse do relógio do aparelho seria recusado como conflito.
 await login(b);await assert.rejects(()=>gravar(b,{...aviso,data:new Date().toISOString()}),e=>e.code==='PT409');
 }finally{await db.close();}
});
