-- Edição rápida do card do funil: nome, telefone, CPF/CNPJ, município e núcleo.
-- Antes da etapa Contrato nenhum dado além do nome é exigido; a partir dela o CPF/CNPJ passa a ser obrigatório.
begin;
alter table public.integracao_crm_cards add column lead_cpf text,add column lead_nucleo_id uuid references public.processos_kanban(id);
alter table public.integracao_crm_cards add constraint crm_lead_cpf_formato check(lead_cpf is null or lead_cpf ~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$' or lead_cpf ~ '^[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}$');

create function integracao_crm_privado.documento_formatado(p text) returns text language plpgsql immutable set search_path='' as $$
declare d text:=regexp_replace(coalesce(p,''),'[^0-9]','','g'); s integer; r integer; pesos integer[];begin
 if d='' then return null;end if;
 if length(d)=11 then
  if d=repeat(substr(d,1,1),11) then raise exception 'CPF inválido, confira os dígitos';end if;
  for pos in 10..11 loop
   s:=0;for i in 1..pos-1 loop s:=s+substr(d,i,1)::integer*(pos+1-i);end loop;
   r:=(s*10)%11;if r=10 then r:=0;end if;
   if r<>substr(d,pos,1)::integer then raise exception 'CPF inválido, confira os dígitos';end if;
  end loop;
  return substr(d,1,3)||'.'||substr(d,4,3)||'.'||substr(d,7,3)||'-'||substr(d,10,2);
 elsif length(d)=14 then
  if d=repeat(substr(d,1,1),14) then raise exception 'CNPJ inválido, confira os dígitos';end if;
  for pos in 13..14 loop
   pesos:=case pos when 13 then array[5,4,3,2,9,8,7,6,5,4,3,2] else array[6,5,4,3,2,9,8,7,6,5,4,3,2] end;
   s:=0;for i in 1..pos-1 loop s:=s+substr(d,i,1)::integer*pesos[i];end loop;
   r:=s%11;r:=case when r<2 then 0 else 11-r end;
   if r<>substr(d,pos,1)::integer then raise exception 'CNPJ inválido, confira os dígitos';end if;
  end loop;
  return substr(d,1,2)||'.'||substr(d,3,3)||'.'||substr(d,6,3)||'/'||substr(d,9,4)||'-'||substr(d,13,2);
 end if;
 raise exception 'Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos';
end $$;
revoke all on function integracao_crm_privado.documento_formatado(text) from public,anon,authenticated;

create or replace view public.integracao_crm_funil with (security_invoker=true) as
 SELECT c.id,c.cliente_id,c.responsavel_id,c.status,c.lead_nome,c.lead_telefone,c.lead_cidade,c.origem,c.origem_id,c.created_at,c.updated_at,
    f.nome,
    CASE WHEN c.cliente_id IS NULL THEN c.lead_cpf ELSE f.cpf_cnpj END AS cpf_cnpj,
    f.codigo,
    COALESCE(f.municipio_id, c.lead_municipio_id) AS municipio_id,
    f.remessa_id,
    m.nome AS municipio,
    r.nome AS remessa,
    (e.dados -> 'requerente'::text) ->> 'telefone'::text AS telefone,
    c.origem_dados,c.valor_total,c.forma_negociacao,c.parcelas,c.desconto_percentual,c.entrada_percentual,c.lead_municipio_id,
    CASE WHEN c.cliente_id IS NULL THEN c.lead_nucleo_id::text ELSE e.dados ->> 'nucleoId'::text END AS nucleo_id,
    array_remove(ARRAY[c.responsavel_id], NULL::uuid) || c.comerciais_adicionais AS responsaveis_ids
   FROM public.integracao_crm_cards c
     LEFT JOIN public.fin_receb_clientes f ON f.id = c.cliente_id
     LEFT JOIN public.fin_receb_municipios m ON m.id = COALESCE(f.municipio_id, c.lead_municipio_id)
     LEFT JOIN public.fin_receb_remessas r ON r.id = f.remessa_id
     LEFT JOIN public.integracao_moradores e ON e.referencia_id = f.id AND e.colecao = 'processos'::text
  WHERE c.arquivado_em IS NULL;

create function integracao_crm_privado.editar_card(p_card uuid,p_nome text,p_telefone text,p_cpf text,p_municipio uuid,p_nucleo text,p_anterior jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.integracao_crm_cards; v jsonb; v_nome text:=trim(coalesce(p_nome,'')); v_telefone text:=trim(coalesce(p_telefone,'')); documento text; atual jsonb; campo text; responsaveis uuid[]; v_nucleo text:=nullif(trim(coalesce(p_nucleo,'')),''); instante timestamptz:=clock_timestamp();begin
 if auth.uid() is null or not integracao_crm_privado.card_permitido(p_card) then raise exception 'Sem permissão';end if;
 select * into c from public.integracao_crm_cards where id=p_card for update;
 if c.arquivado_em is not null then raise exception 'Restaure o lead no Arquivo do CRM antes de alterá-lo';end if;
 if c.origem='vinculado' then raise exception 'Este contato foi vinculado a outro cadastro';end if;
 select to_jsonb(x) into v from public.integracao_crm_funil x where x.id=p_card;
 atual:=jsonb_build_object('nome',coalesce(v->>'nome',v->>'lead_nome',''),'telefone',coalesce(nullif(v->>'telefone',''),v->>'lead_telefone',''),'cpf',coalesce(v->>'cpf_cnpj',''),'municipio_id',coalesce(v->>'municipio_id',''),'nucleo_id',coalesce(v->>'nucleo_id',''));
 foreach campo in array array['nome','telefone','cpf','municipio_id','nucleo_id'] loop
  if p_anterior is null or coalesce(p_anterior->>campo,'') is distinct from atual->>campo then raise exception 'O cadastro foi alterado por outra pessoa. Reabra a edição e confira os dados';end if;
 end loop;
 if length(v_nome) not between 2 and 200 then raise exception 'Informe o nome com pelo menos 2 letras';end if;
 if v_telefone<>'' and (v_telefone !~ '^[+()0-9 .-]{10,25}$' or length(regexp_replace(v_telefone,'[^0-9]','','g'))<10) then raise exception 'Telefone inválido, use DDD e número';end if;
 documento:=integracao_crm_privado.documento_formatado(p_cpf);
 if documento is null and c.status in ('Contrato','Cliente ativo') then raise exception 'O CPF é obrigatório a partir da etapa Contrato';end if;
 -- Um núcleo antigo já gravado no cadastro pode ser mantido; um núcleo novo precisa existir no ERP.
 if v_nucleo is not null and v_nucleo is distinct from nullif(atual->>'nucleo_id','') and (v_nucleo !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not exists(select 1 from public.processos_kanban where id=v_nucleo::uuid)) then raise exception 'Núcleo não encontrado';end if;
 if c.cliente_id is null then
  if p_municipio is null or not exists(select 1 from public.fin_receb_municipios where id=p_municipio) then raise exception 'Escolha o município do lead';end if;
  if v_telefone<>'' and (regexp_replace(v_telefone,'[^0-9]','','g') is distinct from regexp_replace(coalesce(c.lead_telefone,''),'[^0-9]','','g') or p_municipio is distinct from c.lead_municipio_id) then
   responsaveis:=array_remove(array[c.responsavel_id],null)||c.comerciais_adicionais;
   perform pg_advisory_xact_lock(hashtextextended('lead-telefone:'||p_municipio::text||regexp_replace(v_telefone,'[^0-9]','','g'),0));
   if exists(select 1 from public.integracao_crm_cards o where o.id<>p_card and o.arquivado_em is null and o.lead_municipio_id=p_municipio and regexp_replace(o.lead_telefone,'[^0-9]','','g')=regexp_replace(v_telefone,'[^0-9]','','g') and o.origem<>'vinculado' and o.status<>'Perdido' and (o.responsavel_id=any(responsaveis) or o.comerciais_adicionais&&responsaveis)) then raise exception 'Já existe um lead desse telefone e município para um dos comerciais responsáveis';end if;
  end if;
  update public.integracao_crm_cards set lead_nome=v_nome,lead_telefone=nullif(v_telefone,''),lead_cpf=documento,lead_municipio_id=p_municipio,lead_nucleo_id=v_nucleo::uuid,updated_at=instante where id=p_card;
 else
  -- O município de um cliente cadastrado define remessa e código; a troca continua em Abrir cadastro.
  if p_municipio is distinct from (v->>'municipio_id')::uuid then raise exception 'Para trocar o município de um cliente já cadastrado, altere a remessa em Abrir cadastro';end if;
  update public.fin_receb_clientes set nome=v_nome,cpf_cnpj=documento where id=c.cliente_id;
  if exists(select 1 from public.integracao_moradores where referencia_id=c.cliente_id and colecao='processos') then
   update public.integracao_moradores set dados=case when v_nucleo is null then coalesce(dados,'{}'::jsonb)-'nucleoId' else coalesce(dados,'{}'::jsonb)||jsonb_build_object('nucleoId',v_nucleo) end
     ||jsonb_build_object('requerente',coalesce(dados->'requerente','{}'::jsonb)||jsonb_build_object('telefone',v_telefone))
   where referencia_id=c.cliente_id and colecao='processos';
  else
   insert into public.integracao_moradores(colecao,registro_id,referencia_tabela,referencia_id,criado_por,dados)
   values('processos',c.cliente_id::text,'fin_receb_clientes',c.cliente_id,auth.uid(),jsonb_strip_nulls(jsonb_build_object('nucleoId',v_nucleo,'requerente',jsonb_build_object('telefone',v_telefone))));
  end if;
  update public.integracao_crm_cards set updated_at=instante where id=p_card;
 end if;
end $$;
create function public.integracao_crm_editar_card(p_card uuid,p_nome text,p_telefone text,p_cpf text,p_municipio uuid,p_nucleo text,p_anterior jsonb) returns void language sql security invoker set search_path='' as $$select integracao_crm_privado.editar_card(p_card,p_nome,p_telefone,p_cpf,p_municipio,p_nucleo,p_anterior)$$;
revoke all on function integracao_crm_privado.editar_card(uuid,text,text,text,uuid,text,jsonb),public.integracao_crm_editar_card(uuid,text,text,text,uuid,text,jsonb) from public,anon;
grant execute on function integracao_crm_privado.editar_card(uuid,text,text,text,uuid,text,jsonb),public.integracao_crm_editar_card(uuid,text,text,text,uuid,text,jsonb) to authenticated;

-- A conversão em cliente leva o CPF e o núcleo informados no lead.
create or replace function integracao_crm_privado.converter_lead(p_card uuid, p_municipio uuid, p_remessa uuid, p_dados jsonb, p_anterior jsonb) returns uuid language plpgsql security definer set search_path to '' as $function$
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
 insert into public.fin_receb_clientes(municipio_id,remessa_id,codigo,nome,cpf_cnpj) values(p_municipio,p_remessa,codigo_remessa||'_'||lpad(proximo::text,greatest(3,length(proximo::text)),'0'),c.lead_nome,c.lead_cpf) returning id into cliente;
 perform set_config('integracao.conversao_lead','',true);
 insert into public.integracao_moradores(colecao,registro_id,referencia_tabela,referencia_id,criado_por,dados)
 values('processos',cliente::text,'fin_receb_clientes',cliente,auth.uid(),jsonb_build_object('municipioId',p_municipio,'remessaId',p_remessa,'requerente',jsonb_build_object('telefone',c.lead_telefone))||case when c.lead_nucleo_id is null then '{}'::jsonb else jsonb_build_object('nucleoId',c.lead_nucleo_id::text) end);
 update public.integracao_crm_cards set status=p_dados->>'status',valor_total=(p_dados->>'valor_total')::numeric,forma_negociacao=p_dados->>'forma_negociacao',parcelas=(p_dados->>'parcelas')::integer,desconto_percentual=(p_dados->>'desconto_percentual')::numeric,entrada_percentual=(p_dados->>'entrada_percentual')::numeric,lead_municipio_id=p_municipio,updated_at=clock_timestamp() where id=p_card;
 return cliente;
end $function$;
notify pgrst,'reload schema';
commit;
