import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261015234214_recuperar_sincronizacao_e_nuvem_comercial.sql',import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('Commercial can add/move cities only; history, nuclei and configuration stay protected',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema auth;create schema erp_collab_private;create role authenticated;create role anon;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,tipo text,ativo boolean);
 insert into profiles values('${id(1)}','Administrador',true),('${id(2)}','Comercial',true),('${id(3)}','Projetos',true),('${id(4)}','Comercial',false),('${id(5)}','Diretor de Projetos',true);
 create table integracao_configuracoes(colecao text,registro_id text,dados jsonb,criado_por uuid,referencia_tabela text,referencia_id uuid,primary key(colecao,registro_id));
 create table erp_eventos(id uuid primary key,created_by uuid,titulo text);
 create function erp_collab_private.integracao_gestor_calendario() returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and ativo and tipo in ('Administrador','Diretor de Projetos'))$$;
 grant usage on schema public,auth,erp_collab_private to authenticated;grant select on profiles to authenticated;grant select,insert,update,delete on integracao_configuracoes,erp_eventos to authenticated;
 alter table integracao_configuracoes enable row level security;alter table erp_eventos enable row level security;
 create policy ler on integracao_configuracoes for select to authenticated using(exists(select 1 from profiles where id=auth.uid() and ativo));
 create policy dono_evento on erp_eventos for select to authenticated using(created_by=auth.uid());
 create policy editar_evento on erp_eventos for update to authenticated using(created_by=auth.uid());`);
 await db.exec(migration.split('DO $patch$')[0]);
 const vazio={id:'funilInstitucional',valor:{versao:1,cidades:[],nucleos:[],historico:[]}};
 await db.query('insert into integracao_configuracoes values($1,$2,$3,$4,$5,null)',['config','funilInstitucional',vazio,id(1),'integracao_config']);
 await db.query('insert into integracao_configuracoes values($1,$2,$3,$4,$5,null)',['config','outra',{valor:'Preservar'},id(1),'integracao_config']);
 await db.exec(`insert into erp_eventos values('${id(20)}','${id(1)}','Evento');`);
 const login=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
 await login(2);
 const fluxo=structuredClone(vazio);fluxo.valor.cidades.push({id:'c',nome:'Cidade',uf:'SC',etapa:'nuvens'});fluxo.valor.historico.push({id:'h',acao:{tipo:'cidade'}});
 const save=data=>db.query("update integracao_configuracoes set dados=$1 where registro_id='funilInstitucional' returning dados",[data]);
 assert.equal((await save(fluxo)).rows.length,1);
 fluxo.valor.cidades[0].etapa='prospeccao';assert.equal((await save(fluxo)).rows.length,1);
 assert.equal((await db.query("update integracao_configuracoes set dados='{}' where registro_id='outra' returning registro_id")).rows.length,0);
 const mal=structuredClone(fluxo);mal.valor.nucleos.push({nucleoId:'n'});await assert.rejects(()=>save(mal),/Comercial/);
 mal.valor.nucleos=[];mal.valor.cidades=[];await assert.rejects(()=>save(mal),/municípios existentes/);
 mal.valor.cidades=fluxo.valor.cidades;mal.valor.historico=[];await assert.rejects(()=>save(mal),/histórico/);
 assert.equal((await db.query("delete from integracao_configuracoes returning registro_id")).rows.length,0);
 for(const n of [3,4]){await login(n);assert.equal((await save(fluxo)).rows.length,0);}
 await login(5);assert.equal((await db.query("update erp_eventos set titulo='Atualizado' returning id")).rows.length,1);
 await login(2);assert.equal((await db.query("update erp_eventos set titulo='Indevido' returning id")).rows.length,0);
 }finally{await db.close();}
});
