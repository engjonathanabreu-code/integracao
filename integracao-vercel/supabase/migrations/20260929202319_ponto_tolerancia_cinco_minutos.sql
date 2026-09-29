begin;
-- Add an allowance to the balance, without changing punches or overtime.
-- The production function also supports flexible schedules: keep its full body.
do $migration$
declare definicao text; nova text; marcador text:=' v_assinatura:=md5';
begin
 definicao:=pg_get_functiondef('integracao_crm_privado.ponto_dia(uuid,date)'::regprocedure);
 if position(' v_assinatura text;' in definicao)=0 or position(marcador in definicao)=0 or position('regular-previsto+aprovado' in definicao)=0 then
  raise exception 'Cálculo da folha de ponto mudou; revisar a migração';
 end if;
 nova:=replace(definicao,' v_assinatura text;',' tolerancia numeric:=0; tolerancia_abonada integer:=0; v_assinatura text;');
 nova:=replace(nova,marcador,$body$
 -- Fixed schedules only, from the effective date, with complete closed punches.
 if p_dia>=date '2026-09-29' and previsto>0 and fechado and not pendente and cardinality(b)>=2
    and not coalesce((to_jsonb(j)->>'flexivel')::boolean,false) then
  if b[1]>inicio and b[1]<=inicio+interval '5 minutes' then
   tolerancia:=extract(epoch from(b[1]-inicio))/60;
  end if;
  if b[cardinality(b)]<fim and b[cardinality(b)]>=fim-interval '5 minutes' then
   tolerancia:=tolerancia+extract(epoch from(fim-b[cardinality(b)]))/60;
  end if;
  tolerancia_abonada:=greatest(0,least(previsto,floor(dentro+tolerancia)::integer)-regular);
 end if;
 v_assinatura:=md5$body$);
 nova:=replace(nova,'''saldo'',case','''tolerancia_abonada'',tolerancia_abonada,''saldo'',case');
 nova:=replace(nova,'regular-previsto+aprovado','regular+tolerancia_abonada-previsto+aprovado');
 execute nova;
end $migration$;
commit;
