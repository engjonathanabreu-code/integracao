begin;
create function public.integracao_financeiro_criar_entrada(p_cliente uuid,p_valor numeric,p_vencimento date) returns public.fin_receb_parcelas language plpgsql security invoker set search_path='' as $$declare c public.fin_receb_clientes;p public.fin_receb_parcelas;begin
 if not integracao_financeiro_privado.operar() then raise exception 'Sem permissão financeira';end if;
 select * into c from public.fin_receb_clientes where id=p_cliente for update;
 if not found or not c.ativo then raise exception 'Cliente indisponível';end if;
 if p_valor is null or p_valor<=0 or p_valor<>c.valor_entrada or p_vencimento is null then raise exception 'A entrada do contrato mudou. Confira o valor e o vencimento';end if;
 if exists(select 1 from public.fin_receb_parcelas where cliente_id=p_cliente and (tipo='Entrada' or numero=0)) then raise exception 'Já existe uma entrada; edite o lançamento existente';end if;
 insert into public.fin_receb_parcelas(cliente_id,numero,tipo,vencimento,valor_previsto,status,ativo) values(p_cliente,0,'Entrada',p_vencimento,p_valor,'Pendente',true) returning * into p;return p;
end$$;
revoke all on function public.integracao_financeiro_criar_entrada(uuid,numeric,date) from public,anon;grant execute on function public.integracao_financeiro_criar_entrada(uuid,numeric,date) to authenticated;
notify pgrst,'reload schema';commit;
