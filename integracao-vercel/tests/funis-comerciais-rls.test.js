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
 insert into profiles values('${uuid(1)}','Administrador fictício','Administrador',true),('${uuid(2)}','Comercial A','Comercial',true),('${uuid(3)}','Comercial B','Comercial',true),('${uuid(7)}','Comercial C','Comercial',true),('${uuid(4)}','Comercial fora do grupo','Comercial',true),('${uuid(5)}','Inativo','Comercial',false),('${uuid(6)}','Outro setor','Financeiro',true);
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
 await db.exec(`insert into integracao_funil_comerciais(id) values('${uuid(2)}'),('${uuid(3)}'),('${uuid(7)}');`);
 return db;
}
async function como(db,ator,fn){
 const run=async()=>{await db.exec(`set role ${ator===null?'anon':'authenticated'};set request.jwt.claim.sub='${ator===null?'':uuid(ator)}';`);try{return await fn()}finally{await db.exec('reset role;reset request.jwt.claim.sub;')}};
 const result=(db.fila||Promise.resolve()).then(run);db.fila=result.catch(()=>{});return result;
}
const cidade=i=>({tipo:'cidade',id:'c'+i,nome:'Cidade '+i,uf:'SC',etapa:'nuvens'});
async function cloud(db,ator,acao,pedido=crypto.randomUUID(),revisao=null,funilRevisao=0){
 if(revisao===null)revisao=Number((await db.query('select revisao from integracao_funil_nuvem')).rows[0].revisao);
 return como(db,ator,async()=>(await db.query('select public.integracao_nuvem_salvar($1,$2,$3::jsonb,$4) resultado',[revisao,funilRevisao,JSON.stringify(acao),pedido])).rows[0].resultado);
}
async function prospectar(db,ator,i){await cloud(db,2,cidade(i));await cloud(db,2,{...cidade(i),etapa:'prospeccao',responsavelId:uuid(ator)});return (await db.query('select * from integracao_funis_institucionais where id=$1',[uuid(ator)])).rows[0];}
async function salvar(db,ator,revisao,acao,pedido=crypto.randomUUID()){return como(db,ator,async()=>(await db.query('select public.integracao_funil_salvar($1,$2::jsonb,$3) resultado',[revisao,JSON.stringify(acao),pedido])).rows[0].resultado);}
test('RLS isola três funis, permite Nuvem compartilhada e bloqueia demais usuários/inativos/anon',async()=>{
 const db=await banco();try{
 for(const ator of [2,3,7])await prospectar(db,ator,ator);
 for(const ator of [2,3,7]){
  const rows=await como(db,ator,()=>db.query('select * from integracao_funis_institucionais'));assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].id,uuid(ator));
  assert.equal((await como(db,ator,()=>db.query('select * from integracao_funil_nuvem'))).rows.length,1);
  assert.equal((await como(db,ator,()=>db.query('select * from integracao_funil_comerciais where habilitado'))).rows.length,3);
 }
 assert.equal((await como(db,1,()=>db.query('select * from integracao_funis_institucionais'))).rows.length,3);
 for(const ator of [4,5,6]){
  for(const tabela of ['integracao_funis_institucionais','integracao_funil_nuvem'])assert.equal((await como(db,ator,()=>db.query('select * from '+tabela))).rows.length,0);
  await assert.rejects(()=>cloud(db,ator,cidade(50)),/não pode editar/);
 }
 await assert.rejects(()=>cloud(db,null,cidade(50)),/permission denied/);
 await db.query('update profiles set ativo=false where id=$1',[uuid(2)]);
 assert.equal((await como(db,2,()=>db.query('select * from integracao_funis_institucionais'))).rows.length,0);await assert.rejects(()=>cloud(db,2,cidade(50)),/não pode editar/);
 await db.query('update integracao_funil_comerciais set habilitado=false where id=$1',[uuid(3)]);assert.equal((await como(db,3,()=>db.query('select * from integracao_funil_nuvem'))).rows.length,0);
 }finally{await db.close()}
});
test('mutação direta/dono forjado não passam; criação em Prospecção exige atribuição explícita pela Nuvem',async()=>{
 const db=await banco();try{
 await assert.rejects(()=>salvar(db,2,0,{...cidade(0),etapa:'prospeccao',responsavelId:uuid(3)}),/Nuvem compartilhada/);
 await cloud(db,2,cidade(0));const antes=(await db.query('select dados from integracao_funil_nuvem')).rows[0].dados;
 await assert.rejects(()=>cloud(db,2,{...cidade(0),etapa:'prospeccao'}),/Selecione o responsável/);
 await assert.rejects(()=>cloud(db,2,{...cidade(0),etapa:'prospeccao',responsavelId:uuid(4)}),/não está habilitado/);
 assert.deepEqual((await db.query('select dados from integracao_funil_nuvem')).rows[0].dados,antes);
 const r=await cloud(db,2,{...cidade(0),etapa:'prospeccao',responsavelId:uuid(3),autor:'Forjado'});assert.equal(r.funil,null);
 const f=(await db.query('select * from integracao_funis_institucionais')).rows[0];assert.equal(f.id,uuid(3));assert.equal(f.dados.historico[0].autor,'Comercial A');assert.equal(f.dados.historico[0].autorId,uuid(2));assert.equal(f.dados.cidades[0].responsavelId,undefined);
 for(const ator of [1,2,3,4])for(const tabela of ['integracao_funil_nuvem','integracao_funis_institucionais','integracao_funil_comerciais'])for(const sql of ['update '+tabela+' set id=id','delete from '+tabela,'insert into '+tabela+'(id) select id from '+tabela])await assert.rejects(()=>como(db,ator,()=>db.exec(sql)),/permission denied/);
 for(const tabela of ['eventos','nuvem_eventos'])await assert.rejects(()=>como(db,2,()=>db.query('select * from integracao_funil_privado.'+tabela)),/permission denied/);
 }finally{await db.close()}
});
test('migração preserva integralmente Nuvem e histórico legados sem atribuir nem duplicar funis',async()=>{
 const db=await banco();try{
 const origem=(await db.query("select dados from integracao_configuracoes where registro_id='funilInstitucional'")).rows[0].dados;
 assert.deepEqual((await db.query('select dados from integracao_funil_nuvem')).rows[0].dados,origem.valor);
 assert.equal((await db.query('select count(*) from integracao_funis_institucionais')).rows[0].count,0);
 assert.equal((await como(db,2,()=>db.query("select * from integracao_configuracoes where registro_id='funilInstitucional'"))).rows.length,0);
 assert.equal((await como(db,1,()=>db.query("update integracao_configuracoes set dados='{}' where registro_id='funilInstitucional' returning *"))).rows.length,0);
 assert.equal((await como(db,1,()=>db.query("delete from integracao_configuracoes where registro_id='funilInstitucional' returning *"))).rows.length,0);
 assert.equal((await como(db,2,()=>db.query("select * from integracao_configuracoes where registro_id='tema'"))).rows.length,1);
 await cloud(db,2,{tipo:'cidade',id:'legado',etapa:'prospeccao',responsavelId:uuid(7)});
 assert.deepEqual((await db.query("select dados from integracao_configuracoes where registro_id='funilInstitucional'")).rows[0].dados,origem);
 assert.equal((await db.query('select dados from integracao_funil_nuvem')).rows[0].dados.cidades.length,0);
 assert.equal((await db.query('select dados from integracao_funis_institucionais')).rows[0].dados.cidades[0].nome,'Cidade legada');
 }finally{await db.close()}
});
test('duas atribuições concorrentes têm um único vencedor, CAS e idempotência não duplicam município',async()=>{
 const db=await banco();try{
 const p=crypto.randomUUID(),a={tipo:'cidade',id:'legado',etapa:'prospeccao',responsavelId:uuid(2)},b={...a,responsavelId:uuid(3)};
 // A single connection serializes these transactions, as a row lock does in PostgreSQL.
 const results=await Promise.allSettled([cloud(db,2,a,p,0),cloud(db,3,b,crypto.randomUUID(),0)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const first=results[0].value;assert.deepEqual(await cloud(db,2,a,p,0),first);await assert.rejects(()=>cloud(db,2,b,p,0),/outro conteúdo/);
 const rows=(await db.query('select * from integracao_funis_institucionais')).rows;assert.equal(rows.length,1);assert.equal(rows[0].dados.cidades.length,1);assert.equal((await db.query('select count(*) from integracao_funil_privado.nuvem_eventos')).rows[0].count,1);
 await assert.rejects(()=>cloud(db,3,{tipo:'cidade',id:'legado',nome:'Cidade legada',uf:'SC',etapa:'nuvens'}),/já está atribuído/);
 }finally{await db.close()}
});
test('limite quatro é por comercial; núcleos 1:N sem teto e fora do próprio funil são rejeitados',async()=>{
 const db=await banco();try{
 for(const ator of [2,3,7])for(let i=0;i<4;i++)await prospectar(db,ator,ator*10+i);
 await cloud(db,2,cidade(99));const nuvemAntes=(await db.query('select dados from integracao_funil_nuvem')).rows[0].dados;
 await assert.rejects(()=>cloud(db,2,{...cidade(99),etapa:'prospeccao',responsavelId:uuid(7)}),/quatro municípios/);assert.deepEqual((await db.query('select dados from integracao_funil_nuvem')).rows[0].dados,nuvemAntes);
 await assert.rejects(()=>salvar(db,2,4,{tipo:'nucleo',nucleoId:'invasor',cidadeId:'c30',nome:'Outro núcleo',carteira:'reserva'}),/seu fluxo/);
 for(let i=0;i<20;i++)await salvar(db,2,4+i,{tipo:'nucleo',nucleoId:'n'+i,cidadeId:'c20',nome:'Núcleo '+i,carteira:'reserva'});
 const f=(await db.query('select * from integracao_funis_institucionais where id=$1',[uuid(2)])).rows[0];assert.equal(f.dados.nucleos.length,20);assert.ok(f.dados.nucleos.every(n=>n.cidadeId==='c20'));
 await assert.rejects(()=>cloud(db,2,{...cidade(20),etapa:'nuvens'},crypto.randomUUID(),null,24),/Preserve os núcleos/);
 assert.equal((await db.query('select * from integracao_funis_institucionais where id=$1',[uuid(3)])).rows[0].dados.nucleos.length,0);
 }finally{await db.close()}
});
test('devolver município sem núcleo remove dono e preserva campos, histórico e configurações',async()=>{
 const db=await banco();try{
 const f=await prospectar(db,2,0);const r=await cloud(db,2,cidade(0),crypto.randomUUID(),null,Number(f.revisao));
 assert.equal(r.funil.dados.cidades.length,0);assert.equal(r.nuvem.dados.cidades.find(c=>c.id==='c0').responsavelId,undefined);assert.equal(r.funil.dados.historico.length,2);
 await assert.rejects(()=>cloud(db,2,{...cidade(5),responsavelId:uuid(2)}),/não tem responsável/);
 }finally{await db.close()}
});
test('CAS do funil não sobrescreve núcleos e revogação de admin não devolve dados alheios em pedido antigo',async()=>{
 const db=await banco();try{
 await prospectar(db,2,0);const a={tipo:'nucleo',nucleoId:'n1',cidadeId:'c0',nome:'Núcleo um',carteira:'reserva'},p=crypto.randomUUID();const first=await salvar(db,2,1,a,p);
 assert.deepEqual(await salvar(db,2,1,a,p),first);await assert.rejects(()=>salvar(db,2,1,{...a,nucleoId:'n2'}),/funil mudou/);
 await cloud(db,1,cidade(5));const q=crypto.randomUUID(),b={...cidade(5),etapa:'prospeccao',responsavelId:uuid(3)};assert.ok((await cloud(db,1,b,q)).funil);
 await db.query("update profiles set tipo='Comercial' where id=$1",[uuid(1)]);await db.query('insert into integracao_funil_comerciais(id) values($1)',[uuid(1)]);
 assert.equal((await cloud(db,1,b,q,0)).funil,null);
 }finally{await db.close()}
});
