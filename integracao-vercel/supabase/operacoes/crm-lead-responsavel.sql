begin;
-- Keep the four-argument endpoint for already-open clients.
create function integracao_crm_privado.cadastrar_lead(p_id uuid,p_nome text,p_telefone text,p_municipio uuid,p_responsavel uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.integracao_crm_cards; cidade text; begin
 if not integracao_crm_privado.permite('crm') then raise exception 'Sem permissão';end if;
 if p_id is null or length(trim(coalesce(p_nome,'')))<2 or length(regexp_replace(coalesce(p_telefone,''),'\D','','g')) not between 10 and 15 then raise exception 'Preencha nome, telefone válido e município';end if;
 if not exists(select 1 from public.profiles where id=p_responsavel and ativo and tipo='Comercial') then raise exception 'Escolha um responsável comercial ativo';end if;
 perform pg_advisory_xact_lock(hashtextextended('lead:'||p_responsavel::text,0));
 select * into c from public.integracao_crm_cards where id=p_id;
 if found then
 if c.responsavel_id=p_responsavel and exists(select 1 from public.integracao_crm_auditoria a where a.tabela='integracao_crm_cards' and a.registro_id=p_id and a.acao='INSERT' and a.autor_id=auth.uid()) and c.lead_nome=trim(p_nome) and c.lead_telefone=trim(p_telefone) and c.lead_municipio_id=p_municipio then return c.id;end if;
 raise exception 'Pedido já usado por outro cadastro';end if;
 select nome into cidade from public.fin_receb_municipios where id=p_municipio;
 if not found then raise exception 'Selecione um município cadastrado';end if;
 if exists(select 1 from public.integracao_crm_cards where responsavel_id=p_responsavel and lead_municipio_id=p_municipio and regexp_replace(lead_telefone,'\D','','g')=regexp_replace(p_telefone,'\D','','g') and origem<>'vinculado' and status<>'Perdido') then raise exception 'Já existe um lead deste responsável com esse telefone neste município. Abra a ficha existente';end if;
 insert into public.integracao_crm_cards(id,responsavel_id,lead_nome,lead_telefone,lead_cidade,lead_municipio_id,status) values(p_id,p_responsavel,trim(p_nome),trim(p_telefone),cidade,p_municipio,'Cliente novo');return p_id;
end $$;
create function public.integracao_crm_cadastrar_lead(p_id uuid,p_nome text,p_telefone text,p_municipio uuid,p_responsavel uuid) returns uuid language sql security invoker set search_path='' as $$select integracao_crm_privado.cadastrar_lead(p_id,p_nome,p_telefone,p_municipio,p_responsavel)$$;
revoke all on function integracao_crm_privado.cadastrar_lead(uuid,text,text,uuid,uuid),public.integracao_crm_cadastrar_lead(uuid,text,text,uuid,uuid) from public,anon;
grant execute on function integracao_crm_privado.cadastrar_lead(uuid,text,text,uuid,uuid),public.integracao_crm_cadastrar_lead(uuid,text,text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
