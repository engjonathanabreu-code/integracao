-- Preserve CRM access and card policies. Only the status mirrored from a
-- client record already writable by the caller can be changed by this path.
create or replace function integracao_crm_privado.sincronizar_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare card uuid; etapa text;
begin
 if tg_table_name='integracao_crm_cards' then
   if new.status is distinct from old.status and new.cliente_id is not null then
     update public.integracao_moradores set dados=jsonb_set(dados,'{requerente}',coalesce(dados->'requerente','{}'::jsonb)||jsonb_build_object('statusCRM',new.status))
     where referencia_id=new.cliente_id and colecao='processos' and dados->'requerente'->>'statusCRM' is distinct from new.status;
   end if;
 else
   etapa=new.dados->'requerente'->>'statusCRM';
   if etapa is distinct from old.dados->'requerente'->>'statusCRM' then
     select c.id into card from public.integracao_crm_cards c
       where c.cliente_id=new.referencia_id and c.status is distinct from etapa;
     if card is not null then
       if not integracao_crm_privado.card_permitido(card) then
         if not coalesce(
           auth.uid() is not null
           and tg_table_schema='public' and tg_table_name='integracao_moradores' and tg_op='UPDATE'
           and old.colecao='processos' and new.colecao='processos'
           and old.registro_id=new.registro_id
           and old.referencia_tabela='fin_receb_clientes' and new.referencia_tabela='fin_receb_clientes'
           and old.referencia_id=new.referencia_id
           and not exists(select 1 from public.integracao_moradores m
             where m.colecao='processos' and m.referencia_id=new.referencia_id and m.registro_id<>new.registro_id)
           and integracao_crm_privado.permite('crm')
           and integracao_atribuicoes_privado.permitido('clientes','editar'), false)
         then raise exception 'Status comercial exige permissão no CRM e para editar este cadastro';end if;

         -- The original UPDATE already passed its row access checks. The
         -- definer only mirrors this field; no general CRM write is exposed.
         update public.integracao_crm_cards set status=etapa
           where id=card and cliente_id=new.referencia_id and arquivado_em is null;
         if not found then raise exception 'Ficha comercial indisponível para sincronizar o status';end if;
       else
         update public.integracao_crm_cards set status=etapa where id=card;
       end if;
     end if;
   end if;
 end if;
 return new;
end $$;
revoke all on function integracao_crm_privado.sincronizar_status() from public,anon,authenticated;
