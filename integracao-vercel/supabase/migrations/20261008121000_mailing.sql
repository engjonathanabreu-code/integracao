begin;
create schema integracao_mailing_privado;
revoke all on schema integracao_mailing_privado from public,anon;
grant usage on schema integracao_mailing_privado to authenticated;
create function integracao_mailing_privado.setor(tipo text,setor text) returns text language sql immutable set search_path='' as $$
 select case when tipo in ('Administrador','Diretor Técnico','Diretor de Projetos') then 'diretoria' when lower(trim(tipo))='financeiro' or lower(trim(setor))='financeiro' then 'financeiro' when tipo in ('Comercial','Atendimentos') then 'comercial' when tipo='Topografia' then 'topografia' when tipo='Projetos' then 'projeto' when tipo='Pós-protocolo' then 'posprotocolo' when tipo='Jurídico' then 'juridico' else 'consulta' end
$$;
create function integracao_mailing_privado.permite(caixa text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo and (caixa='erp_'||p.id::text or (left(caixa,7)='sector:' and exists(select 1 from public.profiles d where d.ativo and 'sector:'||integracao_mailing_privado.setor(d.tipo,d.setor)=caixa and integracao_mailing_privado.setor(d.tipo,d.setor)<>'consulta') and (integracao_mailing_privado.setor(p.tipo,p.setor)='diretoria' or caixa='sector:'||integracao_mailing_privado.setor(p.tipo,p.setor)))))
$$;
create function integracao_mailing_privado.vazia() returns jsonb language sql immutable set search_path='' as $$select '{"messages":[],"drafts":[],"folders":[],"labels":["Projetos","Documentação","Equipe"],"settings":{},"audit":[]}'::jsonb$$;
create table public.integracao_mailing_caixas(caixa text primary key,dados jsonb not null default integracao_mailing_privado.vazia(),versao bigint not null default 0);
alter table public.integracao_mailing_caixas enable row level security;
revoke all on public.integracao_mailing_caixas from public,anon,authenticated;
create policy mailing_caixa_leitura on public.integracao_mailing_caixas for select to authenticated using(integracao_mailing_privado.permite(caixa));
create table public.integracao_mailing_envios(id uuid primary key,caixa text not null,autor uuid not null references public.profiles(id),data timestamptz not null default now());
alter table public.integracao_mailing_envios enable row level security;
revoke all on public.integracao_mailing_envios from public,anon,authenticated;
create function public.integracao_mailing_contadores() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(b.caixa,jsonb_build_object('received',n.recebidos,'unread',n.nao_lidos)),'{}'::jsonb)
 from public.integracao_mailing_caixas b cross join lateral (
 select count(*) as recebidos,count(*) filter(where not coalesce((m->'flags'->b.caixa->>'read')::boolean,false)) as nao_lidos
 from jsonb_array_elements(b.dados->'messages') m where m->>'copy' in ('incoming','both') and m->>'status'='sent'
 and not coalesce((m->'flags'->b.caixa->>'trash')::boolean,false) and not coalesce((m->'flags'->b.caixa->>'spam')::boolean,false)
 and not coalesce((m->'flags'->b.caixa->>'permanent')::boolean,false) and not coalesce((m->'flags'->b.caixa->>'archive')::boolean,false)
 and (m->'flags'->b.caixa->>'folder') is null and coalesce((m->'flags'->b.caixa->>'snooze')::timestamptz,'-infinity'::timestamptz)<=now()
 ) n where integracao_mailing_privado.permite(b.caixa)
$$;
create function public.integracao_mailing_ler(p_caixa text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.integracao_mailing_caixas; c jsonb;begin
 if not integracao_mailing_privado.permite(p_caixa) then raise exception 'Sem acesso a esta caixa';end if;
 select * into d from public.integracao_mailing_caixas where caixa=p_caixa;
 c:=public.integracao_mailing_contadores();
 return jsonb_build_object('data',jsonb_set(coalesce(d.dados,integracao_mailing_privado.vazia()),'{drafts}',coalesce((select jsonb_agg(x) from jsonb_array_elements(d.dados->'drafts') x where x->>'owner'=auth.uid()::text),'[]'::jsonb)),'version',coalesce(d.versao,0),'mailboxes',c);
end $$;
create function public.integracao_mailing_salvar(p_caixa text,p_versao bigint,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare atual public.integracao_mailing_caixas; m jsonb; anterior jsonb; a jsonb; destinatario text; lista text[]; copia jsonb; outras jsonb; f jsonb; campo text; rascunhos jsonb;begin
 if not integracao_mailing_privado.permite(p_caixa) then raise exception 'Sem acesso a esta caixa';end if;
 -- Serializes the new module only; never locks existing business tables.
 perform pg_advisory_xact_lock(hashtextextended('integracao-mailing',0));
 insert into public.integracao_mailing_caixas(caixa) values(p_caixa) on conflict do nothing;
 select * into atual from public.integracao_mailing_caixas where caixa=p_caixa for update;
 if atual.versao<>p_versao then raise exception 'Esta caixa foi atualizada. Atualize-a antes de salvar; seu rascunho foi preservado.' using errcode='40001';end if;
 if coalesce(p_dados is null  or jsonb_typeof(p_dados->'messages')<>'array' or jsonb_typeof(p_dados->'drafts')<>'array' or jsonb_typeof(p_dados->'folders')<>'array' or jsonb_typeof(p_dados->'settings')<>'object' ,true) then raise exception 'Dados do Mailing inválidos';end if;
 if (select count(*) from jsonb_array_elements(p_dados->'messages'))<>(select count(distinct x->>'id') from jsonb_array_elements(p_dados->'messages') x) then raise exception 'Mensagens duplicadas';end if;
 if jsonb_typeof(p_dados->'labels') is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_dados->'labels') l where jsonb_typeof(l)<>'string') then raise exception 'Marcadores inválidos';end if;
 if exists(select 1 from jsonb_array_elements(p_dados->'folders') x where x->>'user' is distinct from p_caixa or length(coalesce(x->>'id',''))=0 or length(trim(coalesce(x->>'title',''))) not between 1 and 100) then raise exception 'Pasta inválida';end if;
 for m in select value from jsonb_array_elements(p_dados->'messages') loop
  f:=m->'flags'->p_caixa;
  if f is not null then
   if jsonb_typeof(f)<>'object' then raise exception 'Estado da mensagem inválido';end if;
   foreach campo in array array['read','trash','spam','permanent','archive','star'] loop
    if f ? campo and jsonb_typeof(f->campo) not in ('boolean','null') then raise exception 'Estado da mensagem inválido';end if;
   end loop;
   if f->>'snooze' is not null then perform (f->>'snooze')::timestamptz;end if;
   if f ? 'labels' and (jsonb_typeof(f->'labels')<>'array' or exists(select 1 from jsonb_array_elements(f->'labels') l where jsonb_typeof(l)<>'string')) then raise exception 'Marcador inválido';end if;
   if f->>'folder' is not null and not exists(select 1 from jsonb_array_elements(p_dados->'folders') p where p->>'id'=f->>'folder') then raise exception 'Pasta inexistente';end if;
  end if;
 end loop;
 -- Received/sent content is immutable. Flags can change only in this mailbox.
 for anterior in select value from jsonb_array_elements(atual.dados->'messages') loop
  select value into m from jsonb_array_elements(p_dados->'messages') where value->>'id'=anterior->>'id';
  if m is null or (m-'flags') is distinct from (anterior-'flags') then raise exception 'Mensagens já recebidas não podem ser alteradas ou apagadas';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_dados->'drafts') x where x->>'owner' is distinct from auth.uid()::text or x->>'from' is distinct from p_caixa) or (select count(*) from jsonb_array_elements(p_dados->'drafts'))<>(select count(distinct x->>'id') from jsonb_array_elements(p_dados->'drafts') x) then raise exception 'Rascunho inválido';end if;
 rascunhos:='[]'::jsonb;
 for m in select value from jsonb_array_elements(p_dados->'drafts') loop
  select x into anterior from jsonb_array_elements(atual.dados->'drafts') x where x->>'id'=m->>'id';
  if anterior is not null and m-'revision' is distinct from anterior-'revision' and coalesce((m->>'revision')::bigint,0)<>coalesce((anterior->>'revision')::bigint,0) then raise exception 'O rascunho mudou em outra tela. Sua versão foi preservada neste navegador.' using errcode='40001';end if;
  m:=m||jsonb_build_object('revision',coalesce((anterior->>'revision')::bigint,0)+case when m-'revision' is distinct from anterior-'revision' then 1 else 0 end);
  rascunhos:=rascunhos||jsonb_build_array(m);
 end loop;
 p_dados:=jsonb_set(p_dados,'{drafts}',rascunhos);
 p_dados:=jsonb_set(p_dados,'{drafts}',(p_dados->'drafts')||coalesce((select jsonb_agg(x) from jsonb_array_elements(atual.dados->'drafts') x where x->>'owner'<>auth.uid()::text),'[]'::jsonb));
 -- Shared mailbox drafts belong to their author, not to everyone in the sector.
 for anterior in select value from jsonb_array_elements(atual.dados->'drafts') where value->>'owner'<>auth.uid()::text loop
  select value into m from jsonb_array_elements(p_dados->'drafts') where value->>'id'=anterior->>'id';
  if m is distinct from anterior then raise exception 'Rascunho de outro usuário';end if;
 end loop;
 for m in select value from jsonb_array_elements(p_dados->'drafts') loop
  if m->>'owner' is distinct from auth.uid()::text and not exists(select 1 from jsonb_array_elements(atual.dados->'drafts') o where o=m) then raise exception 'Autor do rascunho inválido';end if;
 end loop;
 for m in select value from jsonb_array_elements(p_dados->'messages') n where not exists(select 1 from jsonb_array_elements(atual.dados->'messages') o where o->>'id'=n->>'id') loop
  if coalesce(m->>'owner' is distinct from auth.uid()::text or m->>'from' is distinct from p_caixa or m->>'mailbox' is distinct from p_caixa or m->>'status' is distinct from 'sent' or m->>'copy' not in ('outgoing','both') or length(trim(coalesce(m->>'subject',''))) not between 1 and 300 or length(coalesce(m->>'body',''))>200000 or (length(trim(coalesce(m->>'body','')))=0 and jsonb_array_length(m->'attachments')=0) or jsonb_typeof(m->'to')<>'array' or jsonb_array_length(m->'to')=0 or jsonb_typeof(m->'cc')<>'array' or jsonb_typeof(m->'bcc')<>'array' or jsonb_typeof(m->'attachments')<>'array' ,true) then raise exception 'Mensagem inválida';end if;
  if exists(select 1 from jsonb_array_elements(atual.dados->'drafts') d where d->>'id'=m->>'id' and (d->>'owner' is distinct from auth.uid()::text or coalesce((d->>'revision')::bigint,0)<>coalesce((m->>'revision')::bigint,0))) then raise exception 'O rascunho mudou em outra tela. Confira antes de enviar.' using errcode='40001';end if;
  if exists(select 1 from public.integracao_mailing_envios where id=(m->>'id')::uuid) then raise exception 'Este envio já foi registrado. Atualize a caixa.';end if;
  select array_agg(distinct value) into lista from jsonb_array_elements_text((m->'to')||(m->'cc')||(m->'bcc'));
  if cardinality(lista)>500 then raise exception 'Limite de 500 destinatários';end if;
  foreach destinatario in array lista loop
   if not exists(select 1 from public.profiles p where p.ativo and ('erp_'||p.id::text=destinatario or (integracao_mailing_privado.setor(p.tipo,p.setor)<>'consulta' and 'sector:'||integracao_mailing_privado.setor(p.tipo,p.setor)=destinatario))) then raise exception 'Destinatário interno inválido';end if;
  end loop;
  for a in select value from jsonb_array_elements(m->'attachments') loop
   if not exists(select 1 from storage.objects o where o.bucket_id='integracao-mailing' and o.name=a->>'path' and (o.metadata->>'size')::bigint=(a->>'size')::bigint and (o.metadata->>'size')::bigint<=20971520 and ((split_part(o.name,'/',1)=auth.uid()::text) or exists(select 1 from public.integracao_mailing_caixas b cross join lateral jsonb_array_elements(b.dados->'messages') msg cross join lateral jsonb_array_elements(msg->'attachments') ar where integracao_mailing_privado.permite(b.caixa) and ar->>'path'=o.name))) then raise exception 'Anexo inexistente, sem acesso ou acima de 20 MB';end if;
  end loop;
  insert into public.integracao_mailing_envios(id,caixa,autor) values((m->>'id')::uuid,p_caixa,auth.uid());
  foreach destinatario in array lista loop
   if destinatario=p_caixa then continue;end if;
   copia:=(m-'flags'-'bcc')||jsonb_build_object('mailbox',destinatario,'copy','incoming','bcc','[]'::jsonb,'flags','{}'::jsonb);
   insert into public.integracao_mailing_caixas(caixa) values(destinatario) on conflict do nothing;
   update public.integracao_mailing_caixas set dados=jsonb_set(dados,'{messages}',(dados->'messages')||jsonb_build_array(copia)),versao=versao+1 where caixa=destinatario;
  end loop;
 end loop;
 update public.integracao_mailing_caixas set dados=p_dados-'audit',versao=versao+1 where caixa=p_caixa returning * into atual;
 return jsonb_build_object('data',jsonb_set(atual.dados,'{drafts}',coalesce((select jsonb_agg(x) from jsonb_array_elements(atual.dados->'drafts') x where x->>'owner'=auth.uid()::text),'[]'::jsonb)),'version',atual.versao);
end $$;
insert into storage.buckets(id,name,public,file_size_limit) values('integracao-mailing','integracao-mailing',false,20971520);
create function integracao_mailing_privado.arquivo_permitido(caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and ativo) and (split_part(caminho,'/',1)=auth.uid()::text or exists(select 1 from public.integracao_mailing_caixas b cross join lateral jsonb_array_elements(b.dados->'messages') m cross join lateral jsonb_array_elements(m->'attachments') a where integracao_mailing_privado.permite(b.caixa) and a->>'path'=caminho))
$$;
create policy mailing_anexar on storage.objects for insert to authenticated with check(bucket_id='integracao-mailing' and split_part(name,'/',1)=(select auth.uid())::text and exists(select 1 from public.profiles where id=(select auth.uid()) and ativo));
create policy mailing_download on storage.objects for select to authenticated using(bucket_id='integracao-mailing' and integracao_mailing_privado.arquivo_permitido(name));
revoke all on all functions in schema integracao_mailing_privado from public,anon,authenticated;
grant execute on function integracao_mailing_privado.permite(text),integracao_mailing_privado.arquivo_permitido(text) to authenticated;
revoke all on function public.integracao_mailing_contadores(),public.integracao_mailing_ler(text),public.integracao_mailing_salvar(text,bigint,jsonb) from public,anon;
grant execute on function public.integracao_mailing_contadores(),public.integracao_mailing_ler(text),public.integracao_mailing_salvar(text,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
