import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const dir=new URL('../supabase/migrations/',import.meta.url);
const sql=readFileSync(new URL(readdirSync(dir).find(n=>n.endsWith('_funis_comerciais_isolados.sql')),dir),'utf8');
async function banco(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema integracao_crm_privado;grant usage on schema auth,integracao_crm_privado to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,nome text,tipo text,ativo boolean);
 insert into profiles values('${uuid(1)}','Administrador fictício','Administrador',true),('${uuid(2)}','Comercial A','Comercial',true),('${uuid(3)}','Comercial B','Comercial',true),('${uuid(4)}','Comercial fora do grupo','Comercial',true),('${uuid(5)}','Inativo','Comercial',false),('${uuid(6)}','Outro setor','Financeiro',true);
 grant select on profiles to authenticated;
 create function public.is_comercial() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Comercial')$$;
 create function integracao_crm_privado.permite(modulo text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and (tipo in ('Administrador','Diretor Técnico','Diretor de Projetos') or (modulo='crm' and tipo='Comercial')))$$;
 create function integracao_crm_privado.sinalizar_revisao() returns trigger language plpgsql as $$begin return null;end$$;
 create table integracao_configuracoes(colecao text,registro_id text,dados jsonb,primary key(colecao,registro_id));
 create table integracao_complementos(like integracao_configuracoes including all);
 alter table integracao_configuracoes enable row level security;alter table integracao_complementos enable row level security;
 grant select,insert,update,delete on integracao_configuracoes,integracao_complementos to authenticated;
 create policy base on integracao_configuracoes to authenticated using(true) with check(true);
 create policy base on integracao_complementos to authenticated using(true) with check(true);
 insert into integracao_configuracoes values('config','funilInstitucional','{"valor":{"versao":1,"cidades":[{"id":"legado","nome":"Cidade legada","uf":"SC","etapa":"nuvens"}],"nucleos":[],"historico":[]}}'),('config','tema','{"preservar":true}');`);
 await db.exec(sql);
 await db.exec(`insert into integracao_funil_comerciais(id) values('${uuid(2)}'),('${uuid(3)}');`);
 return db;
}
async function como(db,ator,fn){await db.exec(`set role ${ator===null?'anon':'authenticated'};set request.jwt.claim.sub='${ator===null?'':uuid(ator)}';`);try{return await fn()}finally{await db.exec('reset role;reset request.jwt.claim.sub;')}}
const acao=i=>({tipo:'cidade',id:'c'+i,nome:'Cidade '+i,uf:'SC',etapa:'prospeccao'});
async function salvar(db,ator,revisao,acao,pedido=crypto.randomUUID()) {return como(db,ator,async()=> (await db.query('select public.integracao_funil_salvar($1,$2::jsonb,$3) resultado',[revisao,JSON.stringify(acao),pedido])).rows[0].resultado);}
test('RLS isola os dois comerciais, admins consolidam e outros usuários/anon/inativos não entram',async()=>{
 const db=await banco();try{
 await salvar(db,2,0,acao(0));await salvar(db,3,0,acao(1));
 for(const ator of [2,3]){
 const rows=await como(db,ator,()=>db.query('select * from integracao_funis_institucionais'));assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].id,uuid(ator));
 assert.equal((await como(db,ator,()=>db.query('select * from integracao_funis_institucionais where id=$1',[uuid(ator===2?3:2)]))).rows.length,0);
 assert.equal((await como(db,ator,()=>db.query('select * from integracao_funil_comerciais'))).rows.length,1);
 }
 assert.equal((await como(db,1,()=>db.query('select * from integracao_funis_institucionais'))).rows.length,2);
 for(const ator of [1,4,5,6])await assert.rejects(()=>salvar(db,ator,0,acao(2)),/não está habilitado/);
 for(const ator of [4,5,6])assert.equal((await como(db,ator,()=>db.query('select * from integracao_funis_institucionais'))).rows.length,0);
 await assert.rejects(()=>salvar(db,null,0,acao(2)),/permission denied/);
 await assert.rejects(()=>como(db,null,()=>db.query('select * from integracao_funis_institucionais')),/permission denied/);
 await db.query('update profiles set ativo=false where id=$1',[uuid(2)]);
 assert.equal((await como(db,2,()=>db.query('select * from integracao_funis_institucionais'))).rows.length,0);await assert.rejects(()=>salvar(db,2,1,acao(2)),/não está habilitado/);
 assert.equal((await db.query('select count(*) from integracao_funis_institucionais')).rows[0].count,2);
 }finally{await db.close()}
});
test('API direta não escreve nem transfere dono; RPC não aceita dono ou autor forjados',async()=>{
 const db=await banco();try{
 const result=await salvar(db,2,0,{...acao(0),responsavel_id:uuid(3),autor:'Forjado'});
 assert.equal(result.id,uuid(2));assert.equal(result.dados.historico[0].autor,'Comercial A');assert.equal(result.dados.historico[0].autorId,uuid(2));assert.equal(result.dados.cidades[0].responsavel_id,undefined);
 for(const ator of [1,2,3,4]){
 await assert.rejects(()=>como(db,ator,()=>db.query('update integracao_funis_institucionais set id=$1',[uuid(3)])),/permission denied/);
 await assert.rejects(()=>como(db,ator,()=>db.query('delete from integracao_funis_institucionais')),/permission denied/);
 await assert.rejects(()=>como(db,ator,()=>db.query('insert into integracao_funis_institucionais(id) values($1)',[uuid(3)])),/permission denied/);
 await assert.rejects(()=>como(db,ator,()=>db.query('update integracao_funil_comerciais set habilitado=false')),/permission denied/);
 await assert.rejects(()=>como(db,ator,()=>db.query('select * from integracao_funil_privado.eventos')),/permission denied/);
 }
 assert.equal((await db.query('select count(*) from integracao_funil_privado.eventos')).rows[0].count,1);
 }finally{await db.close()}
});
test('legado sem responsável fica preservado e restrito a admins; outras configurações permanecem acessíveis',async()=>{
 const db=await banco();try{
 const antes=(await db.query("select dados from integracao_configuracoes where registro_id='funilInstitucional'")).rows[0].dados;
 for(const ator of [2,3,4,5,6]){
 assert.equal((await como(db,ator,()=>db.query("select * from integracao_configuracoes where registro_id='funilInstitucional'"))).rows.length,0);
 assert.equal((await como(db,ator,()=>db.query("update integracao_configuracoes set dados='{}' where registro_id='funilInstitucional' returning *"))).rows.length,0);
 await assert.rejects(()=>como(db,ator,()=>db.exec("insert into integracao_complementos values('config','funilInstitucional','{}')")),/row-level security/);
 }
 assert.equal((await como(db,1,()=>db.query("select * from integracao_configuracoes where registro_id='funilInstitucional'"))).rows.length,1);
 assert.equal((await como(db,2,()=>db.query("select * from integracao_configuracoes where registro_id='tema'"))).rows.length,1);
 assert.deepEqual((await db.query("select dados from integracao_configuracoes where registro_id='funilInstitucional'")).rows[0].dados,antes);
 assert.equal((await db.query('select count(*) from integracao_funis_institucionais')).rows[0].count,0);
 }finally{await db.close()}
});
test('CAS não perde atualização, pedidos repetidos não duplicam e auditoria usa identidade/horário do servidor',async()=>{
 const db=await banco();try{
 const pedido=crypto.randomUUID(),primeiro=await salvar(db,2,0,acao(0),pedido);
 const concorrentes=await Promise.allSettled([salvar(db,2,1,acao(1)),salvar(db,2,1,acao(2))]);assert.equal(concorrentes.filter(r=>r.status==='fulfilled').length,1);assert.equal(concorrentes.filter(r=>r.status==='rejected').length,1);
 const repetido=await salvar(db,2,0,acao(0),pedido);assert.deepEqual(repetido,primeiro);await assert.rejects(()=>salvar(db,2,0,acao(9),pedido),/outro conteúdo/);
 const row=(await db.query('select * from integracao_funis_institucionais')).rows[0];assert.equal(Number(row.revisao),2);assert.equal(row.dados.historico.length,2);assert.equal(row.dados.cidades.length,2);
 assert.equal((await db.query('select count(*) from integracao_funil_privado.eventos')).rows[0].count,2);
 assert.ok(row.dados.historico.every(h=>h.autorId===uuid(2)&&h.autor==='Comercial A'&&Date.parse(h.data)));
 }finally{await db.close()}
});
test('quatro municípios por pessoa, múltiplos núcleos próprios e ausência de vínculos externos',async()=>{
 const db=await banco();try{
 let r;for(let i=0;i<4;i++)r=await salvar(db,2,i,acao(i));
 await assert.rejects(()=>salvar(db,2,4,acao(4)),/quatro municípios/);
 await assert.rejects(()=>salvar(db,2,4,{...acao(4),institucionalId:'externo'}),/fluxo é independente/);
 await assert.rejects(()=>salvar(db,3,0,{tipo:'nucleo',nucleoId:'n',cidadeId:'c0',nome:'Outro',carteira:'reserva'}),/seu fluxo precisa/);
 for(let i=0;i<20;i++)r=await salvar(db,2,r.revisao,{tipo:'nucleo',nucleoId:'n'+i,cidadeId:'c0',nome:'Núcleo '+i,carteira:'reserva'});
 assert.equal(r.dados.nucleos.length,20);assert.ok(r.dados.nucleos.every(n=>n.cidadeId==='c0'));
 let b;for(let i=0;i<4;i++)b=await salvar(db,3,i,acao(i));assert.equal(b.dados.cidades.length,4);
 assert.equal((await db.query('select count(*) from integracao_funis_institucionais')).rows[0].count,2);
 }finally{await db.close()}
});
