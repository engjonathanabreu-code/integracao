begin;
create function integracao_crm_privado.normalizar(valor text) returns text language sql immutable set search_path='' as $$
 select trim(regexp_replace(translate(lower(coalesce(valor,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'\s+',' ','g'))
$$;
create function integracao_crm_privado.telefone(valor text) returns text language sql immutable set search_path='' as $$
 select case when length(n) in (10,11) then '55'||n when length(n) between 12 and 15 then n else '' end from (select regexp_replace(coalesce(valor,''),'\D','','g') n) t
$$;
create function integracao_crm_privado.nome(valor text,codigo text,prefixo text) returns text language plpgsql immutable set search_path='' as $$
declare n text=integracao_crm_privado.normalizar(valor); p text; begin
 foreach p in array array[integracao_crm_privado.normalizar(codigo),integracao_crm_privado.normalizar(prefixo)] loop
  if p<>'' and left(n,length(p))=p and substring(n from length(p)+1 for 1) ~ '[\s_:–—-]' then return regexp_replace(substring(n from length(p)+1),'^[\s_:–—-]+',''); end if;
 end loop; return n;
end $$;
revoke all on function integracao_crm_privado.normalizar(text),integracao_crm_privado.telefone(text),integracao_crm_privado.nome(text,text,text) from public;
grant execute on function integracao_crm_privado.normalizar(text),integracao_crm_privado.telefone(text),integracao_crm_privado.nome(text,text,text) to service_role;

-- Only the authenticated server can reconcile identity. The phone comes from the
-- received Chatwoot contact, never from model output. Ambiguities remain leads.
create function public.integracao_crm_identificar(instalacao text,conta bigint,conversa bigint,nome text default '',cidade text default '',documento text default '') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.integracao_crm_conversas; lead public.integracao_crm_cards; candidatos uuid[]; alvo uuid; existente uuid; tel text; doc text;
begin
 select * into v from public.integracao_crm_conversas x where x.instalacao=$1 and x.conta_id=$2 and x.conversa_id=$3;
 if v.id is null then return jsonb_build_object('confirmado',false,'acao','aguardar_conversa'); end if;
 perform pg_advisory_xact_lock(hashtextextended(concat($1,':',$2,':',v.contato_id),0));
 select * into v from public.integracao_crm_conversas x where x.id=v.id for update;
 if v.identidade_confirmada then return jsonb_build_object('confirmado',true); end if;
 select * into lead from public.integracao_crm_cards where id=v.card_id for update;
 tel=integracao_crm_privado.telefone(lead.lead_telefone); doc=regexp_replace(coalesce(documento,''),'\D','','g');
 if tel='' or (doc='' and (length(trim(nome))<5 or trim(cidade)='')) then
  return jsonb_build_object('confirmado',false,'acao','solicitar_dados','pergunta','Pode informar seu nome completo e o município do imóvel?');
 end if;
 select array_agg(distinct c.id) into candidatos from public.fin_receb_clientes c
 left join public.fin_receb_municipios m on m.id=c.municipio_id
 left join public.integracao_moradores e on e.referencia_id=c.id and e.colecao='processos'
 where (integracao_crm_privado.telefone(e.dados->'requerente'->>'telefone')=tel or integracao_crm_privado.telefone(to_jsonb(c)->>'telefone')=tel)
 and (case when doc<>'' then length(doc) in (11,14) and regexp_replace(coalesce(c.cpf_cnpj,''),'\D','','g')=doc
 else integracao_crm_privado.nome(c.nome,c.codigo,to_jsonb(m)->>'prefixo')=integracao_crm_privado.normalizar($4)
 and integracao_crm_privado.normalizar(m.nome)=integracao_crm_privado.normalizar($5) end);
 if coalesce(cardinality(candidatos),0)<>1 then return jsonb_build_object('confirmado',false,'acao','conferir_identidade','pergunta','Não consegui confirmar seu cadastro com segurança. Pode conferir seu nome completo, CPF e o município do imóvel?'); end if;
 alvo=candidatos[1];
 if lead.cliente_id is not null and lead.cliente_id<>alvo then return jsonb_build_object('confirmado',false,'acao','revisao_equipe'); end if;
 perform pg_advisory_xact_lock(hashtextextended(alvo::text,1));
 select id into existente from public.integracao_crm_cards where cliente_id=alvo for update;
 if existente is not null and existente<>lead.id then
  -- Move only this verified contact's conversations. Other contacts on the same
  -- canonical card must never inherit this identity confirmation.
  update public.integracao_crm_conversas set card_id=existente,identidade_confirmada=true where card_id=lead.id and integracao_crm_conversas.instalacao=$1 and conta_id=$2 and contato_id=v.contato_id;
  if lead.cliente_id is null and not exists(select 1 from public.integracao_crm_conversas where card_id=lead.id) then
   update public.integracao_crm_atendimentos set card_id=existente where card_id=lead.id;
   update public.integracao_crm_tarefas set card_id=existente where card_id=lead.id;
   update public.integracao_crm_cards set origem='vinculado',responsavel_id=null where id=lead.id;
  end if;
 else
  update public.integracao_crm_cards set cliente_id=alvo,updated_at=now() where id=lead.id;
  update public.integracao_crm_conversas set identidade_confirmada=true where card_id=lead.id and integracao_crm_conversas.instalacao=$1 and conta_id=$2 and contato_id=v.contato_id;
 end if;
 insert into public.integracao_crm_auditoria(tabela,registro_id,acao,atual) values('integracao_crm_conversas',v.id,'IDENTIDADE_CONFIRMADA',jsonb_build_object('cliente_id',alvo,'criterio',case when doc<>'' then 'telefone_documento' else 'telefone_nome_municipio' end));
 return jsonb_build_object('confirmado',true);
end $$;
revoke all on function public.integracao_crm_identificar(text,bigint,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.integracao_crm_identificar(text,bigint,bigint,text,text,text) to service_role;

-- Existing nucleus IDs can be canonical UUIDs or local IDs; resolve both.
create or replace function public.integracao_crm_contexto(instalacao text,conta bigint,conversa bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('nucleo',n.nucleo,'instrucao',i.instrucao,'andamentos',coalesce((select jsonb_agg(jsonb_build_object('status',a.status,'status_operacional',a.status_operacional,'descricao',a.descricao_cliente,'data',a.data_atualizacao,'previsao',a.previsao,'orientacao',a.orientacao_ia) order by a.data_atualizacao desc nulls last,a.id) from public.processos_kanban_andamentos a where a.processo_id=n.id and a.visivel_ia is true),'[]'::jsonb))
 from public.integracao_crm_conversas v join public.integracao_crm_cards c on c.id=v.card_id
 join public.integracao_moradores m on m.referencia_id=c.cliente_id and m.colecao='processos'
 join public.processos_kanban n on n.id::text=m.dados->>'nucleoId' or n.id=(select en.referencia_id from public.integracao_nucleos en where en.registro_id=m.dados->>'nucleoId')
 join public.integracao_nucleo_ia i on i.id=n.id and i.habilitado
 where v.instalacao=$1 and v.conta_id=$2 and v.conversa_id=$3 and v.identidade_confirmada
$$;
-- Respect all existing opt-outs. Only bootstrap nuclei with already public-to-AI progress.
insert into public.integracao_nucleo_ia(id,habilitado,instrucao)
 select distinct processo_id,true,'Responda somente com os andamentos liberados deste núcleo. Não invente prazos nem exponha observações internas.'
 from public.processos_kanban_andamentos where visivel_ia=true
 on conflict(id) do nothing;
commit;
