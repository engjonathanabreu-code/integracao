begin;

create schema if not exists integracao_metas_privado;
revoke all on schema integracao_metas_privado from public, anon;
grant usage on schema integracao_metas_privado to authenticated;

-- Read the canonical profile and relationship without reentering those tables' policies.
-- These helpers answer only for the calling identity; the schema is not exposed in PostgREST.
create function integracao_metas_privado.papel()
returns text language sql stable security definer set search_path = '' as $$
  select p.tipo from public.profiles p where p.id = (select auth.uid()) and p.ativo;
$$;

create function integracao_metas_privado.destinatario_ativo(p_usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select integracao_metas_privado.papel() is not null and exists (
    select 1 from public.profiles p where p.id = p_usuario and p.ativo
  );
$$;

-- Pós-protocolo mantém a gerência legítima de Metas e setores do ERP.
create function integracao_metas_privado.gerencia()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(integracao_metas_privado.papel() in ('Administrador', 'Diretor Técnico', 'Diretor de Projetos', 'Diretor de Projeto', 'Pós-protocolo', 'Pós Protocolo'), false);
$$;

create function integracao_metas_privado.visivel(p_meta uuid, p_autor boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select integracao_metas_privado.papel() is not null and exists (
    select 1 from public.metas m where m.id = p_meta and (
      integracao_metas_privado.gerencia() or m.created_by = (select auth.uid()) or
      (not p_autor and exists (select 1 from public.meta_responsaveis r
        where r.meta_id = m.id and r.usuario_id = (select auth.uid())))
    )
  );
$$;
revoke execute on all functions in schema integracao_metas_privado from public, anon;
grant execute on function integracao_metas_privado.papel(), integracao_metas_privado.destinatario_ativo(uuid), integracao_metas_privado.gerencia(), integracao_metas_privado.visivel(uuid, boolean) to authenticated;

-- Restrictive is intentional: existing permissive administrator and contract
-- policies cannot grant access beyond these parent/child boundaries.
create policy integracao_metas_ler on public.metas as restrictive for select to authenticated
  using (integracao_metas_privado.gerencia() or
    (integracao_metas_privado.papel() is not null and created_by = (select auth.uid())) or
    integracao_metas_privado.visivel(id));
create policy integracao_metas_criar on public.metas as restrictive for insert to authenticated
  with check (integracao_metas_privado.papel() is not null and created_by = (select auth.uid())
    and integracao_atribuicoes_privado.permitido('metas', 'criar', integracao_metas_privado.gerencia()));
create policy integracao_metas_editar on public.metas as restrictive for update to authenticated
  using (integracao_metas_privado.visivel(id)) with check (integracao_metas_privado.visivel(id));
create policy integracao_metas_excluir on public.metas as restrictive for delete to authenticated
  using (integracao_metas_privado.visivel(id, true));

create policy integracao_setores_ler on public.meta_setores as restrictive for select to authenticated
  using (integracao_metas_privado.papel() is not null);
create policy integracao_setores_criar on public.meta_setores as restrictive for insert to authenticated
  with check (integracao_metas_privado.gerencia() and created_by = (select auth.uid()));
create policy integracao_setores_editar on public.meta_setores as restrictive for update to authenticated
  using (integracao_metas_privado.gerencia()) with check (integracao_metas_privado.gerencia());
create policy integracao_setores_excluir on public.meta_setores as restrictive for delete to authenticated
  using (integracao_metas_privado.gerencia());

create policy integracao_responsaveis_ler on public.meta_responsaveis as restrictive for select to authenticated
  using (integracao_metas_privado.visivel(meta_id));
create policy integracao_responsaveis_criar on public.meta_responsaveis as restrictive for insert to authenticated
  with check (integracao_metas_privado.visivel(meta_id, true) and integracao_metas_privado.destinatario_ativo(usuario_id));
-- The mutation RPC locks the row before deleting. A trigger makes the identity immutable.
create policy integracao_responsaveis_editar on public.meta_responsaveis as restrictive for update to authenticated
  using (integracao_metas_privado.visivel(meta_id, true)) with check (integracao_metas_privado.visivel(meta_id, true));
create policy integracao_responsaveis_excluir on public.meta_responsaveis as restrictive for delete to authenticated
  using (integracao_metas_privado.visivel(meta_id, true));

create policy integracao_projetos_ler on public.meta_projetos as restrictive for select to authenticated
  using (integracao_metas_privado.visivel(meta_id));
create policy integracao_projetos_criar on public.meta_projetos as restrictive for insert to authenticated
  with check (integracao_metas_privado.visivel(meta_id, true) and created_by = (select auth.uid()));
create policy integracao_projetos_editar on public.meta_projetos as restrictive for update to authenticated
  using (false);
create policy integracao_projetos_excluir on public.meta_projetos as restrictive for delete to authenticated
  using (integracao_metas_privado.visivel(meta_id, true));

create policy integracao_checklist_ler on public.meta_checklist as restrictive for select to authenticated
  using (integracao_metas_privado.visivel(meta_id));
create policy integracao_checklist_criar on public.meta_checklist as restrictive for insert to authenticated
  with check (integracao_metas_privado.visivel(meta_id) and created_by = (select auth.uid())
    and (concluido_por is null or concluido_por = (select auth.uid())));
create policy integracao_checklist_editar on public.meta_checklist as restrictive for update to authenticated
  using (integracao_metas_privado.visivel(meta_id)) with check (integracao_metas_privado.visivel(meta_id));
create policy integracao_checklist_excluir on public.meta_checklist as restrictive for delete to authenticated
  using (integracao_metas_privado.visivel(meta_id));

create policy integracao_comentarios_ler on public.meta_comentarios as restrictive for select to authenticated
  using (integracao_metas_privado.visivel(meta_id));
create policy integracao_comentarios_criar on public.meta_comentarios as restrictive for insert to authenticated
  with check (integracao_metas_privado.visivel(meta_id) and autor_id = (select auth.uid()));
create policy integracao_comentarios_editar on public.meta_comentarios as restrictive for update to authenticated
  using (integracao_metas_privado.visivel(meta_id) and (autor_id = (select auth.uid()) or integracao_metas_privado.gerencia()))
  with check (integracao_metas_privado.visivel(meta_id) and (autor_id = (select auth.uid()) or integracao_metas_privado.gerencia()));
create policy integracao_comentarios_excluir on public.meta_comentarios as restrictive for delete to authenticated
  using (integracao_metas_privado.visivel(meta_id) and (autor_id = (select auth.uid()) or integracao_metas_privado.gerencia()));

create policy integracao_historico_ler on public.meta_historico as restrictive for select to authenticated
  using (integracao_metas_privado.visivel(meta_id) or (meta_id is null and integracao_metas_privado.papel() is not null
    and (autor_id = (select auth.uid()) or integracao_metas_privado.gerencia())));
create policy integracao_historico_inserir on public.meta_historico as restrictive for insert to authenticated
  with check (integracao_metas_privado.visivel(meta_id) and autor_id = (select auth.uid()));
create policy integracao_historico_editar on public.meta_historico as restrictive for update to authenticated using (false);
create policy integracao_historico_excluir on public.meta_historico as restrictive for delete to authenticated using (false);

create policy integracao_anexos_ler on public.meta_arquivos as restrictive for select to authenticated
  using (integracao_metas_privado.visivel(meta_id));
create policy integracao_anexos_criar on public.meta_arquivos as restrictive for insert to authenticated
  with check (integracao_metas_privado.visivel(meta_id) and enviado_por = (select auth.uid())
    and split_part(caminho_storage, '/', 1) = (select auth.uid())::text
    and split_part(caminho_storage, '/', 2) = 'metas' and split_part(caminho_storage, '/', 3) = meta_id::text
    and split_part(caminho_storage, '/', 4) <> '');
create policy integracao_anexos_editar on public.meta_arquivos as restrictive for update to authenticated
  using (integracao_metas_privado.visivel(meta_id)) with check (integracao_metas_privado.visivel(meta_id));
create policy integracao_anexos_excluir on public.meta_arquivos as restrictive for delete to authenticated
  using (integracao_metas_privado.visivel(meta_id));

create function integracao_metas_privado.proteger_identidades()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_table_name = 'metas' then
    if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.created_by is distinct from old.created_by) then
      raise exception 'Identidade e autoria da meta são imutáveis' using errcode = '42501';
    end if;
    if new.status = 'Concluído' and (tg_op = 'INSERT' or old.status is distinct from new.status)
      and not integracao_atribuicoes_privado.permitido('metas', 'aprovar', integracao_metas_privado.gerencia()) then
      raise exception 'Aprovação de meta não autorizada' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and not integracao_metas_privado.visivel(old.id, true)
      and not integracao_atribuicoes_privado.permitido('metas', 'editar', false) then
      if (to_jsonb(new) - array['status', 'updated_at', 'ordem_coluna'])
        is distinct from (to_jsonb(old) - array['status', 'updated_at', 'ordem_coluna']) then
        raise exception 'Somente a gestão ou o autor pode editar os dados da meta' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
        and not coalesce(new.status = 'Aguardando aprovação' and old.status = 'Em andamento', false)
        and not integracao_atribuicoes_privado.permitido('metas', 'aprovar', false) then
        raise exception 'Transição de meta não autorizada' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name = 'meta_responsaveis' then
    if new is distinct from old then raise exception 'Use a operação de atribuição' using errcode = '42501'; end if;
  elsif tg_table_name = 'meta_checklist' then
    if new.id is distinct from old.id or new.meta_id is distinct from old.meta_id or new.created_by is distinct from old.created_by
      or (new.concluido_por is distinct from old.concluido_por and new.concluido_por is distinct from auth.uid() and new.concluido_por is not null) then
      raise exception 'Identidade ou autoria do checklist inválida' using errcode = '42501';
    end if;
  elsif tg_table_name = 'meta_comentarios' then
    if new.id is distinct from old.id or new.meta_id is distinct from old.meta_id or new.autor_id is distinct from old.autor_id then
      raise exception 'Identidade e autoria do comentário são imutáveis' using errcode = '42501';
    end if;
  elsif tg_table_name = 'meta_arquivos' then
    if new.id is distinct from old.id or new.meta_id is distinct from old.meta_id or new.enviado_por is distinct from old.enviado_por
      or new.caminho_storage is distinct from old.caminho_storage then
      raise exception 'Identidade e vínculo do arquivo são imutáveis' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function integracao_metas_privado.proteger_identidades() from public, anon, authenticated;
create trigger integracao_meta_identidade before insert or update on public.metas
  for each row execute function integracao_metas_privado.proteger_identidades();
create trigger integracao_meta_resp_identidade before update on public.meta_responsaveis
  for each row execute function integracao_metas_privado.proteger_identidades();
create trigger integracao_meta_check_identidade before update on public.meta_checklist
  for each row execute function integracao_metas_privado.proteger_identidades();
create trigger integracao_meta_com_identidade before update on public.meta_comentarios
  for each row execute function integracao_metas_privado.proteger_identidades();
create trigger integracao_meta_arq_identidade before update on public.meta_arquivos
  for each row execute function integracao_metas_privado.proteger_identidades();

-- O upload antecede os metadados no ERP e no Integração. O dono pode acessar
-- seu próprio objeto provisório. Uma vez vinculado, vale o escopo da meta.
create function integracao_metas_privado.ler_objeto(p_caminho text)
returns boolean language sql stable security definer set search_path = '' as $$
  select integracao_metas_privado.papel() is not null and (
    exists (select 1 from public.meta_arquivos a where a.caminho_storage = p_caminho
      and integracao_metas_privado.visivel(a.meta_id))
    or (split_part(p_caminho, '/', 1) = (select auth.uid())::text
      and not exists (select 1 from public.meta_arquivos a where a.caminho_storage = p_caminho))
  );
$$;
revoke execute on function integracao_metas_privado.ler_objeto(text) from public, anon;
grant execute on function integracao_metas_privado.ler_objeto(text) to authenticated;

-- Preserve the other uses of the documentos bucket.
create policy integracao_storage_metas_vinculo on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and split_part(name, '/', 2) = 'metas'
    and integracao_metas_privado.ler_objeto(name));
create policy integracao_storage_metas_ler on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'documentos' or split_part(name, '/', 2) <> 'metas'
    or integracao_metas_privado.ler_objeto(name));

commit;
