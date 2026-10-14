-- Proposta para revisão: não aplicada ao banco de produção.
-- Conserva autorização, auditoria e concorrência do editor existente.
begin;
create or replace function integracao_crm_privado.menor_nascimento(p text, referencia date)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare nascimento date;
begin
 if p is null or p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
 begin nascimento:=p::date; exception when datetime_field_overflow or invalid_datetime_format then return false; end;
 if to_char(nascimento,'YYYY-MM-DD')<>p or nascimento>referencia then return false; end if;
 return extract(year from referencia)-extract(year from nascimento)<18 or (extract(year from referencia)-extract(year from nascimento)=18 and to_char(referencia,'MM-DD')<to_char(nascimento,'MM-DD'));
end $$;
revoke all on function integracao_crm_privado.menor_nascimento(text,date) from public,anon,authenticated;
do $$
declare definicao text; alvo text := 'if documento is null and c.status in (''Contrato'',''Cliente ativo'') then';
begin
 select pg_get_functiondef('integracao_crm_privado.editar_card(uuid,text,text,text,uuid,text,jsonb)'::regprocedure) into definicao;
 if position(alvo in definicao)=0 then raise exception 'Editor CRM diferente da base revisada. Interrompido sem alterar o editor.';end if;
 definicao:=replace(definicao,alvo,
 'if documento is null and c.status in (''Contrato'',''Cliente ativo'') and not exists (
   select 1 from public.integracao_moradores e where e.colecao=''processos'' and e.referencia_id=c.cliente_id
   and coalesce(e.dados->''requerente''->>''tipoPessoa'','''')<>''juridica''
   and integracao_crm_privado.menor_nascimento(e.dados->''requerente''->>''nascimento'',(now() at time zone ''America/Sao_Paulo'')::date)
 ) then');
 execute definicao;
end $$;
commit;
