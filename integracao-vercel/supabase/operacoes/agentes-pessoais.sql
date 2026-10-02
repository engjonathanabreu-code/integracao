-- Apenas objetos novos. Nenhum cadastro, evento, histórico ou arquivo existente é alterado.
create table public.integracao_agentes_pessoais_registros (
 owner_id uuid not null references public.profiles(id),
 kind text not null check (kind in ('log','file','message','avatar')),
 record_id text not null check (length(record_id) between 1 and 100),
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=1048576),
 created_at timestamptz not null default now(),
 primary key(owner_id,kind,record_id)
);
create index integracao_agentes_pessoais_criado on public.integracao_agentes_pessoais_registros(owner_id,created_at desc);
alter table public.integracao_agentes_pessoais_registros enable row level security;
revoke all on public.integracao_agentes_pessoais_registros from anon,authenticated;
grant select,insert on public.integracao_agentes_pessoais_registros to authenticated;
grant update(payload) on public.integracao_agentes_pessoais_registros to authenticated;
create function public.integracao_agente_pessoal_acesso(p_owner uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo=true)
 and (p_owner=auth.uid() or auth.uid()='0f5e3976-ab5f-427b-923b-781fa5eaf3f0'::uuid);
$$;
revoke all on function public.integracao_agente_pessoal_acesso(uuid) from public,anon;
grant execute on function public.integracao_agente_pessoal_acesso(uuid) to authenticated;
create policy agentes_pessoais_leitura on public.integracao_agentes_pessoais_registros for select to authenticated using(public.integracao_agente_pessoal_acesso(owner_id));
create policy agentes_pessoais_insercao on public.integracao_agentes_pessoais_registros for insert to authenticated with check(owner_id=auth.uid() and public.integracao_agente_pessoal_acesso(owner_id));
create policy agentes_pessoais_avatar on public.integracao_agentes_pessoais_registros for update to authenticated using(owner_id=auth.uid() and kind='avatar' and public.integracao_agente_pessoal_acesso(owner_id)) with check(owner_id=auth.uid() and kind='avatar' and public.integracao_agente_pessoal_acesso(owner_id));
insert into storage.buckets(id,name,public,file_size_limit) values('integracao-agentes-pessoais','integracao-agentes-pessoais',false,26214400);
create policy agentes_pessoais_arquivos_leitura on storage.objects for select to authenticated using(case when bucket_id='integracao-agentes-pessoais' then public.integracao_agente_pessoal_acesso(case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (storage.foldername(name))[1]::uuid else null end) else false end);
create policy agentes_pessoais_arquivos_insercao on storage.objects for insert to authenticated with check(bucket_id='integracao-agentes-pessoais' and (storage.foldername(name))[1]=auth.uid()::text and public.integracao_agente_pessoal_acesso(auth.uid()));
-- Não há DELETE: versões e histórico são preservados. Arquivos recebem caminhos únicos.
