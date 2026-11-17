import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql = name => readFileSync(new URL('../supabase/migrations/'+name, import.meta.url), 'utf8');
const id = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('políticas preservam o fluxo de autor, responsável e direção e isolam terceiros e inativos', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create role service_role bypassrls;
      create schema auth;
      create schema storage;
      create schema integracao_atribuicoes_privado;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function public.is_admin() returns boolean language sql stable as $$select false$$;
      create function public.can_access_plan(uuid) returns boolean language sql stable as $$select false$$;
      create function integracao_atribuicoes_privado.permitido(text,text,boolean) returns boolean language sql stable as $$select $3 or ($2='criar' and auth.uid()='${id(1)}')$$;
      grant usage on schema auth,storage,integracao_atribuicoes_privado to authenticated,anon;
      create table public.profiles(id uuid primary key, tipo text, ativo boolean);
      create table public.metas(id uuid primary key, created_by uuid, titulo text, status text);
      create table public.meta_setores(id uuid primary key,created_by uuid);
      create table public.meta_responsaveis(meta_id uuid references metas on delete cascade, usuario_id uuid, primary key(meta_id,usuario_id));
      create table public.meta_projetos(meta_id uuid,processo_id uuid,created_by uuid);
      create table public.meta_checklist(id uuid primary key,meta_id uuid,created_by uuid,concluido_por uuid,concluido boolean);
      create table public.meta_comentarios(id uuid primary key,meta_id uuid,autor_id uuid,texto text);
      create table public.meta_historico(id uuid primary key,meta_id uuid references metas on delete set null,autor_id uuid,descricao text);
      create table public.meta_arquivos(id uuid primary key,meta_id uuid,caminho_storage text,enviado_por uuid);
      create table public.etapas_plano(id uuid primary key,plano_id uuid);
      create table public.documentos(caminho_storage text,enviado_por uuid,etapa_plano_id uuid);
      create table public.fin_receb_clientes(id uuid,cpf_cnpj text,valor_global numeric);
      create table storage.objects(bucket_id text,name text);
      grant select,insert,update,delete on all tables in schema public to authenticated,anon,service_role;
      grant select,insert on storage.objects to authenticated;
      insert into profiles values ('${id(1)}','Comercial',true), ('${id(2)}','Projetos',true),
        ('${id(3)}','Consulta',true), ('${id(4)}','Diretor Técnico',true), ('${id(5)}','Projetos',false), ('${id(6)}','Pós-protocolo',true);
      insert into metas values ('${id(10)}','${id(1)}','Meta fictícia','Em andamento'),
        ('${id(11)}','${id(2)}','Outra meta','Em andamento');
      insert into meta_responsaveis values ('${id(10)}','${id(2)}'), ('${id(10)}','${id(5)}');
      insert into meta_historico values ('${id(12)}','${id(10)}','${id(1)}','Evento sintético');
      insert into meta_arquivos values ('${id(13)}','${id(10)}','${id(1)}/metas/${id(10)}/anexo.pdf','${id(1)}');
      insert into storage.objects values ('documentos','${id(1)}/metas/${id(10)}/anexo.pdf'),
        ('documentos','${id(1)}/outro/arquivo.pdf');
      insert into fin_receb_clientes values ('${id(20)}','SINTETICO',10);
      alter table storage.objects enable row level security;
      create policy legado on storage.objects to authenticated using (true) with check (true);
      alter table fin_receb_clientes enable row level security;
      create policy legado on fin_receb_clientes to authenticated using (true) with check (true);
    `);
    for (const tabela of ['metas','meta_setores','meta_responsaveis','meta_projetos','meta_checklist','meta_comentarios','meta_historico','meta_arquivos']) {
      await db.exec(`alter table ${tabela} enable row level security;
        create policy legado on ${tabela} to authenticated using(true) with check(true);`);
    }
    await db.exec(sql('20260924190000_metas_arquivos_responsaveis.sql'));
    async function como(n, papel='authenticated') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n) : '']);
      await db.exec('set role '+papel);
    }
    const linhas = async (q,p=[]) => (await db.query(q,p)).rows;
    await como(3);
    assert.equal((await linhas('select id from metas')).length,2,'reproduz a leitura excessiva anterior');
    assert.equal((await linhas("update meta_historico set descricao='Teste anterior' returning id")).length,1);
    await db.exec('reset role');
    await db.exec(sql('20261117143000_escopo_metas_e_anexos.sql'));
    await db.exec(sql('20261117143100_ficha_clientes_grants_anon.sql'));
    await como(3);
    assert.deepEqual(await linhas('select id from metas'),[]);
    assert.deepEqual(await linhas('select id from meta_arquivos'),[]);
    assert.deepEqual(await linhas("select name from storage.objects where name like '%/metas/%'"),[]);
    await assert.rejects(linhas('insert into meta_responsaveis values ($1,$2)',[id(10),id(3)]),{code:'42501'});
    await assert.rejects(linhas('insert into metas values ($1,$2,$3,$4)',[id(21),id(1),'Terceiro','Em andamento']),{code:'42501'});
    await assert.rejects(linhas('insert into metas values ($1,$2,$3,$4)',[id(21),id(3),'Sem autorização de criação','Em andamento']),{code:'42501'});
    assert.deepEqual(await linhas("update meta_historico set descricao='Negado' returning id"),[]);
    assert.deepEqual(await linhas('delete from meta_historico returning id'),[]);
    assert.deepEqual(await linhas('select cpf_cnpj,valor_global from fin_receb_clientes'),[{cpf_cnpj:'SINTETICO',valor_global:'10'}]);
    assert.equal((await linhas("update fin_receb_clientes set cpf_cnpj='SINTETICO-EDITADO' returning id")).length,1);
    await como(5);
    assert.deepEqual(await linhas('select id from metas'),[]);
    assert.deepEqual(await linhas("select name from storage.objects where name like '%/metas/%'"),[]);
    await como(0,'anon');
    assert.deepEqual(await linhas('select id from metas'),[]);
    await assert.rejects(linhas('select cpf_cnpj from fin_receb_clientes'),{code:'42501'});
    await como(1);
    assert.deepEqual(await linhas('select id from metas'),[{id:id(10)}]);
    assert.equal((await linhas('insert into metas values ($1,$2,$3,$4) returning id',[id(21),id(1),'Criação com releitura','Em andamento'])).length,1);
    assert.equal((await linhas('insert into meta_responsaveis values ($1,$2) returning usuario_id',[id(21),id(2)])).length,1);
    assert.equal((await linhas('select * from meta_responsaveis where meta_id=$1 for update',[id(21)])).length,1,'a trava do RPC continua possível');
    await assert.rejects(linhas('update meta_responsaveis set usuario_id=$1 where meta_id=$2',[id(3),id(21)]),{code:'42501'});
    await assert.rejects(linhas('insert into meta_responsaveis values ($1,$2)',[id(21),id(5)]),{code:'42501'});
    await assert.rejects(linhas('insert into meta_arquivos values ($1,$2,$3,$4)',[id(22),id(21),id(2)+'/metas/'+id(11)+'/alheio.pdf',id(1)]),{code:'42501'});
    const caminho=id(1)+'/metas/'+id(21)+'/novo.pdf';
    await linhas("insert into storage.objects values ('documentos',$1)",[caminho]);
    assert.equal((await linhas('select name from storage.objects where name=$1',[caminho])).length,1,'o upload é legível antes do vínculo');
    assert.equal((await linhas('insert into meta_arquivos values ($1,$2,$3,$4) returning id',[id(22),id(21),caminho,id(1)])).length,1);
    assert.equal((await linhas('insert into meta_projetos values ($1,$2,$3) returning meta_id',[id(21),id(45),id(1)])).length,1);
    await como(2);
    assert.deepEqual((await linhas('select id from metas order by id')).map(x=>x.id),[id(10),id(11),id(21)]);
    assert.equal((await linhas("select name from storage.objects where name like '%/metas/%'")).length,2);
    await assert.rejects(linhas("update metas set status='Concluído' where id=$1",[id(10)]),{code:'42501'});
    await assert.rejects(linhas('insert into meta_responsaveis values ($1,$2)',[id(10),id(3)]),{code:'42501'});
    assert.equal((await linhas("update metas set status='Aguardando aprovação' where id=$1 returning id",[id(10)])).length,1);
    assert.equal((await linhas('insert into meta_checklist values ($1,$2,$3,null,false) returning id',[id(25),id(10),id(2)])).length,1);
    assert.equal((await linhas('update meta_checklist set concluido=true, concluido_por=$1 where id=$2 returning id',[id(2),id(25)])).length,1);
    await assert.rejects(linhas('update meta_checklist set meta_id=$1 where id=$2',[id(11),id(25)]),{code:'42501'});
    assert.equal((await linhas('insert into meta_comentarios values ($1,$2,$3,$4) returning id',[id(26),id(10),id(2),'Comentário fictício'])).length,1);
    assert.equal((await linhas('insert into meta_historico values ($1,$2,$3,$4) returning id',[id(27),id(10),id(2),'Evento fictício'])).length,1);
    await como(6);
    assert.equal((await linhas('select id from metas')).length,3,'Pós-protocolo preserva gerência no ERP');
    assert.equal((await linhas('insert into meta_setores values ($1,$2) returning id',[id(40),id(6)])).length,1);
    assert.equal((await linhas("select name from storage.objects where name like '%/metas/%'")).length,2);
    await como(4);
    assert.equal((await linhas("update metas set status='Concluído' where id=$1 returning id",[id(10)])).length,1);
    assert.equal((await linhas("select name from storage.objects where name like '%/metas/%'")).length,2);
    assert.deepEqual(await linhas("update meta_historico set descricao='Negado' returning id"),[]);
    assert.equal((await linhas('delete from metas where id=$1 returning id',[id(10)])).length,1);
    assert.equal((await linhas('select id from meta_historico where meta_id is null')).length,2,'a exclusão preserva o histórico');
    await como(0,'service_role');
    assert.equal((await linhas('select id from metas')).length,2);
  } finally { await db.close(); }
});
