begin;
alter table public.integracao_crm_cards add column lead_municipio_id uuid references public.fin_receb_municipios(id);
create or replace view public.integracao_crm_funil with(security_invoker=true) as
 select c.id,c.cliente_id,c.responsavel_id,c.status,c.lead_nome,c.lead_telefone,c.lead_cidade,c.origem,c.origem_id,c.created_at,c.updated_at,
 f.nome,f.cpf_cnpj,f.codigo,coalesce(f.municipio_id,c.lead_municipio_id) municipio_id,f.remessa_id,m.nome municipio,r.nome remessa,e.dados->'requerente'->>'telefone' telefone,c.origem_dados,c.valor_total,c.forma_negociacao,c.parcelas,c.desconto_percentual,c.entrada_percentual,c.lead_municipio_id
 from public.integracao_crm_cards c left join public.fin_receb_clientes f on f.id=c.cliente_id
 left join public.fin_receb_municipios m on m.id=coalesce(f.municipio_id,c.lead_municipio_id) left join public.fin_receb_remessas r on r.id=f.remessa_id
 left join public.integracao_moradores e on e.referencia_id=f.id and e.colecao='processos';
create function integracao_crm_privado.cadastrar_lead(p_id uuid,p_nome text,p_telefone text,p_municipio uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.integracao_crm_cards; cidade text; begin
 if not integracao_crm_privado.permite('crm') then raise exception 'Sem permissão';end if;
 if p_id is null or length(trim(coalesce(p_nome,'')))<2 or length(regexp_replace(coalesce(p_telefone,''),'\D','','g')) not between 10 and 15 then raise exception 'Preencha nome, telefone válido e município';end if;
 perform pg_advisory_xact_lock(hashtextextended('lead:'||auth.uid()::text,0));
 select * into c from public.integracao_crm_cards where id=p_id;
 if found then
 if c.responsavel_id=auth.uid() and c.lead_nome=trim(p_nome) and c.lead_telefone=trim(p_telefone) and c.lead_municipio_id=p_municipio then return c.id;end if;
 raise exception 'Pedido já usado por outro cadastro';end if;
 select nome into cidade from public.fin_receb_municipios where id=p_municipio;
 if not found then raise exception 'Selecione um município cadastrado';end if;
 if exists(select 1 from public.integracao_crm_cards where responsavel_id=auth.uid() and lead_municipio_id=p_municipio and regexp_replace(lead_telefone,'\D','','g')=regexp_replace(p_telefone,'\D','','g') and origem<>'vinculado' and status<>'Perdido') then raise exception 'Já existe um lead seu com esse telefone neste município. Abra a ficha existente';end if;
 insert into public.integracao_crm_cards(id,responsavel_id,lead_nome,lead_telefone,lead_cidade,lead_municipio_id,status) values(p_id,auth.uid(),trim(p_nome),trim(p_telefone),cidade,p_municipio,'Cliente novo');return p_id;
end $$;
create function public.integracao_crm_cadastrar_lead(p_id uuid,p_nome text,p_telefone text,p_municipio uuid) returns uuid language sql security invoker set search_path='' as $$select integracao_crm_privado.cadastrar_lead(p_id,p_nome,p_telefone,p_municipio)$$;
create or replace function integracao_crm_privado.novo_cliente() returns trigger language plpgsql security definer set search_path='' as $$
declare lead uuid:=nullif(current_setting('integracao.conversao_lead',true),'')::uuid;begin
 if integracao_crm_privado.permite('crm') then
 if lead is not null and integracao_crm_privado.card_permitido(lead) then
 update public.integracao_crm_cards set cliente_id=new.id where id=lead and cliente_id is null;
 if not found then raise exception 'Lead já convertido';end if;
 else insert into public.integracao_crm_cards(cliente_id,responsavel_id) values(new.id,auth.uid());end if;
 end if;return new;
end $$;
create function integracao_crm_privado.converter_lead(p_card uuid,p_municipio uuid,p_remessa uuid,p_dados jsonb,p_anterior jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.integracao_crm_cards; cliente uuid; campo text; codigo_remessa text; proximo integer; begin
 if not integracao_crm_privado.card_permitido(p_card) then raise exception 'Sem permissão';end if;
 select * into c from public.integracao_crm_cards where id=p_card for update;
 if c.origem='vinculado' then raise exception 'Este contato já foi vinculado';end if;
 if p_dados->>'status' not in ('Contrato','Cliente ativo') or p_dados->>'status' is null then raise exception 'Escolha Contrato para confirmar o cliente';end if;
 if c.cliente_id is not null then
 if exists(select 1 from public.fin_receb_clientes where id=c.cliente_id and municipio_id=p_municipio and remessa_id=p_remessa) and to_jsonb(c) @> p_dados then return c.cliente_id;end if;
 raise exception 'Lead já convertido. Atualize a ficha';end if;
 foreach campo in array array['status','valor_total','forma_negociacao','parcelas','desconto_percentual','entrada_percentual'] loop
 if not coalesce(p_anterior ? campo,false) or (to_jsonb(c)->campo) is distinct from p_anterior->campo then raise exception 'A negociação mudou. Reabra a ficha antes de confirmar';end if;end loop;
 if c.lead_municipio_id is not null and c.lead_municipio_id<>p_municipio then raise exception 'A remessa deve pertencer ao município do lead';end if;
 select codigo into codigo_remessa from public.fin_receb_remessas where id=p_remessa and municipio_id=p_municipio and ativo;
 if not found then raise exception 'Confirme uma remessa ativa do município';end if;
 perform pg_advisory_xact_lock(hashtextextended('cliente-remessa:'||p_remessa::text,0));
 select coalesce(max(substring(codigo from '_([0-9]+)$')::integer),0)+1 into proximo from public.fin_receb_clientes where remessa_id=p_remessa;
 perform set_config('integracao.conversao_lead',p_card::text,true);
 insert into public.fin_receb_clientes(municipio_id,remessa_id,codigo,nome) values(p_municipio,p_remessa,codigo_remessa||'_'||lpad(proximo::text,greatest(3,length(proximo::text)),'0'),c.lead_nome) returning id into cliente;
 perform set_config('integracao.conversao_lead','',true);
 insert into public.integracao_moradores(colecao,registro_id,referencia_tabela,referencia_id,criado_por,dados)
 values('processos',cliente::text,'fin_receb_clientes',cliente,auth.uid(),jsonb_build_object('municipioId',p_municipio,'remessaId',p_remessa,'requerente',jsonb_build_object('telefone',c.lead_telefone)));
 update public.integracao_crm_cards set status=p_dados->>'status',valor_total=(p_dados->>'valor_total')::numeric,forma_negociacao=p_dados->>'forma_negociacao',parcelas=(p_dados->>'parcelas')::integer,desconto_percentual=(p_dados->>'desconto_percentual')::numeric,entrada_percentual=(p_dados->>'entrada_percentual')::numeric,lead_municipio_id=p_municipio,updated_at=clock_timestamp() where id=p_card;
 return cliente;
end $$;
create function public.integracao_crm_converter_lead(p_card uuid,p_municipio uuid,p_remessa uuid,p_dados jsonb,p_anterior jsonb) returns uuid language sql security invoker set search_path='' as $$select integracao_crm_privado.converter_lead(p_card,p_municipio,p_remessa,p_dados,p_anterior)$$;
create function integracao_crm_privado.exigir_conversao() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.cliente_id is null and new.status in ('Contrato','Cliente ativo') and new.status is distinct from old.status then raise exception 'Confirme o município e a remessa para converter o lead em cliente';end if;return new;end $$;
create trigger crm_exigir_conversao before update on public.integracao_crm_cards for each row execute function integracao_crm_privado.exigir_conversao();
revoke all on function integracao_crm_privado.cadastrar_lead(uuid,text,text,uuid),public.integracao_crm_cadastrar_lead(uuid,text,text,uuid),integracao_crm_privado.converter_lead(uuid,uuid,uuid,jsonb,jsonb),public.integracao_crm_converter_lead(uuid,uuid,uuid,jsonb,jsonb),integracao_crm_privado.exigir_conversao() from public,anon;
grant execute on function integracao_crm_privado.cadastrar_lead(uuid,text,text,uuid),public.integracao_crm_cadastrar_lead(uuid,text,text,uuid),integracao_crm_privado.converter_lead(uuid,uuid,uuid,jsonb,jsonb),public.integracao_crm_converter_lead(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
