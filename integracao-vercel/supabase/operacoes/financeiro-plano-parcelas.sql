-- Proposta local para revisão. Não aplicada à produção.
-- Usa exclusivamente a autorização financeira existente. Sem envio bancário.
begin;
create function public.integracao_financeiro_plano(p_cliente uuid,p_anteriores jsonb default null,p_itens jsonb default null,p_motivo text default null,p_pedido uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.fin_receb_parcelas; item jsonb; linhas jsonb:='[]'; snapshot jsonb; protegidas uuid[]:='{}'; banco boolean; maximo integer; afetada uuid; pedido jsonb; hash text; resultado jsonb; total integer:=0;
begin
 if auth.uid() is null or not integracao_financeiro_privado.operar() then raise exception 'Acesso financeiro somente para consulta';end if;
 -- Serializa revisões e bloqueia inserções concorrentes que referenciam o cliente.
 perform 1 from public.fin_receb_clientes where id=p_cliente for update;
 if not found then raise exception 'Cliente indisponível';end if;
 hash:=md5(jsonb_build_object('cliente',p_cliente,'anteriores',p_anteriores,'itens',p_itens,'motivo',p_motivo)::text);
 if p_itens is not null and p_pedido is not null then
  select depois into pedido from integracao_financeiro_privado.auditoria where depois->>'plano_pedido'=p_pedido::text limit 1;
  if found then
   if pedido->>'autor'<>auth.uid()::text or pedido->>'hash'<>hash then raise exception 'Pedido já utilizado com conteúdo diferente';end if;
   return pedido->'resultado';
  end if;
 end if;
 for p in select * from public.fin_receb_parcelas where cliente_id=p_cliente and ativo order by id for update loop
  banco:=false;
  if to_regclass('ailos_privado.boletos') is not null then
   execute 'select exists(select 1 from ailos_privado.boletos where parcela_id=$1 or snapshot->>''parcela_id''=$1::text)' into banco using p.id;
  end if;
  banco:=banco or p.tipo='Entrada' or p.status in ('Pago','Parcial','Cancelado') or coalesce(p.valor_liquidado,0)>0 or p.pago_em is not null or nullif(p.linha_digitavel,'') is not null or nullif(p.nosso_numero,'') is not null or nullif(p.documento,'') is not null;
  if banco then protegidas:=array_append(protegidas,p.id);end if;
  linhas:=linhas||jsonb_build_array(to_jsonb(p)||jsonb_build_object('protegida',banco));
 end loop;
 if p_itens is null then return jsonb_build_object('parcelas',linhas);end if;
 if p_pedido is null or length(trim(coalesce(p_motivo,'')))<5 or length(p_motivo)>2000 or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>360 then raise exception 'Confira o plano, o pedido e o motivo';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','versao',(x->>'versao')::bigint) order by x->>'id'),'[]') into snapshot from jsonb_array_elements(linhas) x;
 if p_anteriores is distinct from snapshot then raise exception 'As parcelas mudaram em outro sistema. Reabra a prévia.' using errcode='PT409';end if;
 if (select count(*) from jsonb_array_elements(p_itens) x where nullif(x->>'id','') is not null)<>(select count(distinct x->>'id') from jsonb_array_elements(p_itens) x where nullif(x->>'id','') is not null) then raise exception 'Parcela repetida';end if;
 select coalesce(max(numero),0) into maximo from public.fin_receb_parcelas where cliente_id=p_cliente;
 for item in select value from jsonb_array_elements(p_itens) loop
  if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','vencimento','valor_previsto')) then raise exception 'Campo inválido no plano';end if;
  if coalesce(item->>'valor_previsto','') !~ '^[0-9]+(\.[0-9]{1,2})? or (item->>'valor_previsto')::numeric<0 or round((item->>'valor_previsto')::numeric,2)<>(item->>'valor_previsto')::numeric or item->>'vencimento' is null then raise exception 'Confira vencimentos e valores';end if;
  if nullif(item->>'id','') is null then
   maximo:=maximo+1;
   insert into public.fin_receb_parcelas(cliente_id,numero,vencimento,valor_previsto,status,valor_liquidado,diferenca,ativo,tipo,juros,multa)
   values(p_cliente,maximo,(item->>'vencimento')::date,(item->>'valor_previsto')::numeric,'Pendente',0,0,true,'Parcela',0,0) returning id into afetada;
   insert into integracao_financeiro_privado.auditoria(parcela_id,autor,antes,depois) select id,auth.uid(),null,to_jsonb(t) from public.fin_receb_parcelas t where id=afetada;
  else
   if (item->>'id')::uuid=any(protegidas) or not exists(select 1 from jsonb_array_elements(linhas) x where x->>'id'=item->>'id') then raise exception 'Parcela protegida ou indisponível';end if;
   select * into p from public.fin_receb_parcelas where id=(item->>'id')::uuid;
   perform public.integracao_financeiro_editar(p.id,p.versao,jsonb_build_object('vencimento',item->>'vencimento','valor_previsto',(item->>'valor_previsto')::numeric));
   afetada:=p.id;
  end if;
  total:=total+1;
 end loop;
 for p in select * from public.fin_receb_parcelas where cliente_id=p_cliente and ativo and not(id=any(protegidas)) and exists(select 1 from jsonb_array_elements(linhas) x where x->>'id'=id::text) loop
  if not exists(select 1 from jsonb_array_elements(p_itens) x where x->>'id'=p.id::text) then
   update public.fin_receb_parcelas set ativo=false,status='Cancelado' where id=p.id;
   afetada:=p.id;
  end if;
 end loop;
 resultado:=jsonb_build_object('editaveis',total,'protegidas',cardinality(protegidas),'pedido',p_pedido);
 if afetada is not null then insert into integracao_financeiro_privado.auditoria(parcela_id,autor,antes,depois) values(afetada,auth.uid(),null,jsonb_build_object('plano_pedido',p_pedido,'autor',auth.uid(),'hash',hash,'motivo',p_motivo,'resultado',resultado));end if;
 return resultado;
end $$;
revoke all on function public.integracao_financeiro_plano(uuid,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.integracao_financeiro_plano(uuid,jsonb,jsonb,text,uuid) to authenticated;
commit;
 or coalesce(item->>'vencimento','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} or (item->>'valor_previsto')::numeric<0 or round((item->>'valor_previsto')::numeric,2)<>(item->>'valor_previsto')::numeric or item->>'vencimento' is null then raise exception 'Confira vencimentos e valores';end if;
  if nullif(item->>'id','') is null then
   maximo:=maximo+1;
   insert into public.fin_receb_parcelas(cliente_id,numero,vencimento,valor_previsto,status,valor_liquidado,diferenca,ativo,tipo,juros,multa)
   values(p_cliente,maximo,(item->>'vencimento')::date,(item->>'valor_previsto')::numeric,'Pendente',0,0,true,'Parcela',0,0) returning id into afetada;
   insert into integracao_financeiro_privado.auditoria(parcela_id,autor,antes,depois) select id,auth.uid(),null,to_jsonb(t) from public.fin_receb_parcelas t where id=afetada;
  else
   if (item->>'id')::uuid=any(protegidas) or not exists(select 1 from jsonb_array_elements(linhas) x where x->>'id'=item->>'id') then raise exception 'Parcela protegida ou indisponível';end if;
   select * into p from public.fin_receb_parcelas where id=(item->>'id')::uuid;
   perform public.integracao_financeiro_editar(p.id,p.versao,jsonb_build_object('vencimento',item->>'vencimento','valor_previsto',(item->>'valor_previsto')::numeric));
   afetada:=p.id;
  end if;
  total:=total+1;
 end loop;
 for p in select * from public.fin_receb_parcelas where cliente_id=p_cliente and ativo and not(id=any(protegidas)) and exists(select 1 from jsonb_array_elements(linhas) x where x->>'id'=id::text) loop
  if not exists(select 1 from jsonb_array_elements(p_itens) x where x->>'id'=p.id::text) then
   update public.fin_receb_parcelas set ativo=false,status='Cancelado' where id=p.id;
   afetada:=p.id;
  end if;
 end loop;
 resultado:=jsonb_build_object('editaveis',total,'protegidas',cardinality(protegidas),'pedido',p_pedido);
 if afetada is not null then insert into integracao_financeiro_privado.auditoria(parcela_id,autor,antes,depois) values(afetada,auth.uid(),null,jsonb_build_object('plano_pedido',p_pedido,'autor',auth.uid(),'hash',hash,'motivo',p_motivo,'resultado',resultado));end if;
 return resultado;
end $$;
revoke all on function public.integracao_financeiro_plano(uuid,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.integracao_financeiro_plano(uuid,jsonb,jsonb,text,uuid) to authenticated;
commit;
 then raise exception 'Confira vencimentos e valores em centavos';end if;
  if (item->>'valor_previsto')::numeric is null or (item->>'valor_previsto')::numeric<0 or round((item->>'valor_previsto')::numeric,2)<>(item->>'valor_previsto')::numeric or item->>'vencimento' is null then raise exception 'Confira vencimentos e valores';end if;
  if nullif(item->>'id','') is null then
   maximo:=maximo+1;
   insert into public.fin_receb_parcelas(cliente_id,numero,vencimento,valor_previsto,status,valor_liquidado,diferenca,ativo,tipo,juros,multa)
   values(p_cliente,maximo,(item->>'vencimento')::date,(item->>'valor_previsto')::numeric,'Pendente',0,0,true,'Parcela',0,0) returning id into afetada;
   insert into integracao_financeiro_privado.auditoria(parcela_id,autor,antes,depois) select id,auth.uid(),null,to_jsonb(t) from public.fin_receb_parcelas t where id=afetada;
  else
   if (item->>'id')::uuid=any(protegidas) or not exists(select 1 from jsonb_array_elements(linhas) x where x->>'id'=item->>'id') then raise exception 'Parcela protegida ou indisponível';end if;
   select * into p from public.fin_receb_parcelas where id=(item->>'id')::uuid;
   perform public.integracao_financeiro_editar(p.id,p.versao,jsonb_build_object('vencimento',item->>'vencimento','valor_previsto',(item->>'valor_previsto')::numeric));
   afetada:=p.id;
  end if;
  total:=total+1;
 end loop;
 for p in select * from public.fin_receb_parcelas where cliente_id=p_cliente and ativo and not(id=any(protegidas)) and exists(select 1 from jsonb_array_elements(linhas) x where x->>'id'=id::text) loop
  if not exists(select 1 from jsonb_array_elements(p_itens) x where x->>'id'=p.id::text) then
   update public.fin_receb_parcelas set ativo=false,status='Cancelado' where id=p.id;
   afetada:=p.id;
  end if;
 end loop;
 resultado:=jsonb_build_object('editaveis',total,'protegidas',cardinality(protegidas),'pedido',p_pedido);
 if afetada is not null then insert into integracao_financeiro_privado.auditoria(parcela_id,autor,antes,depois) values(afetada,auth.uid(),null,jsonb_build_object('plano_pedido',p_pedido,'autor',auth.uid(),'hash',hash,'motivo',p_motivo,'resultado',resultado));end if;
 return resultado;
end $$;
revoke all on function public.integracao_financeiro_plano(uuid,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.integracao_financeiro_plano(uuid,jsonb,jsonb,text,uuid) to authenticated;
commit;
