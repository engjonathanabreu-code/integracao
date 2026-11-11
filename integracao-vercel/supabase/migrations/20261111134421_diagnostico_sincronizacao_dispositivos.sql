-- Additive, opt-in health reports. No business data or queue contents are accepted.
create schema if not exists integracao_sincronizacao_privado;
revoke all on schema integracao_sincronizacao_privado from public,anon;
create table public.integracao_sincronizacao_dispositivos (
 usuario_id uuid not null references public.profiles(id),
 instalacao_id uuid not null,
 versao text not null check (versao ~ '^[a-zA-Z0-9._-]{1,64}$'),
 resumo jsonb not null,
 ultimo_contato timestamptz not null default now(),
 primary key (usuario_id,instalacao_id)
);
alter table public.integracao_sincronizacao_dispositivos enable row level security;
revoke all on public.integracao_sincronizacao_dispositivos from public,anon,authenticated;
grant select,insert,update on public.integracao_sincronizacao_dispositivos to authenticated;
create policy ler_diagnostico on public.integracao_sincronizacao_dispositivos for select to authenticated
 using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo
  and (usuario_id=p.id or p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto'))));
create policy inserir_diagnostico on public.integracao_sincronizacao_dispositivos for insert to authenticated
 with check (usuario_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo));
create policy atualizar_diagnostico on public.integracao_sincronizacao_dispositivos for update to authenticated
 using (usuario_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo))
 with check (usuario_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo));
create function integracao_sincronizacao_privado.validar() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 if tg_op='UPDATE' and (new.usuario_id<>old.usuario_id or new.instalacao_id<>old.instalacao_id) then
  raise exception 'Identidade do diagnóstico é imutável' using errcode='22023';
 end if;
 if jsonb_typeof(new.resumo)<>'array' or jsonb_array_length(new.resumo)>256 then
  raise exception 'Resumo inválido' using errcode='22023';
 end if;
 for item in select * from jsonb_array_elements(new.resumo) loop
  if jsonb_typeof(item)<>'object' or not (item ?& array['estado','modulo','codigo','quantidade'])
   or item-array['estado','modulo','codigo','quantidade']<>'{}'::jsonb
   or item->>'estado' not in ('persistencia_falhou','legado_revisao','pendente_local','resultado_desconhecido','confirmado_aguardando_leitura','bloqueado_conflito','bloqueado_validacao','falha_transitoria')
   or item->>'modulo' not in ('processos','municipios','remessas','nucleos','metas','planos','ordensServico','eventos','usuarios','arquivos','auditoria','config','crmCards','crmAtendimentos','crmTarefas','conversas','mensagens','pontoBatidas','pontoSolicitacoes','marketingGrupos','outros')
   or not (item->>'codigo' ~ '^[0-9A-Z]{5}$' or item->>'codigo' in ('SEM_ERRO','OUTRO','SESSAO_EXPIRADA','SESSAO_AUSENTE','TRANSPORTE','LEITURA_DIVERGENTE','ARQUIVO_LOCAL_AUSENTE','RESPONSAVEL_INDISPONIVEL','IDENTIDADE_OUTRA_META','PERSISTENCIA_INDISPONIVEL','PERSISTENCIA_ABORTADA','FILA_BLOQUEADA'))
   or jsonb_typeof(item->'quantidade')<>'number' or item->>'quantidade' !~ '^[1-9][0-9]{0,6}$'
   or exists(select 1 from jsonb_each(item) f where f.key<>'quantidade' and jsonb_typeof(f.value)<>'string') then
   raise exception 'Resumo contém campos não permitidos' using errcode='22023';
  end if;
 end loop;
 new.ultimo_contato=clock_timestamp();
 return new;
end $$;
revoke all on function integracao_sincronizacao_privado.validar() from public,anon,authenticated;
create trigger validar_diagnostico before insert or update on public.integracao_sincronizacao_dispositivos
 for each row execute function integracao_sincronizacao_privado.validar();
comment on table public.integracao_sincronizacao_dispositivos is 'Último relato por conta/instalação, sem conteúdo local. Sem contato recente significa estado desconhecido. Não permite comandos remotos.';
