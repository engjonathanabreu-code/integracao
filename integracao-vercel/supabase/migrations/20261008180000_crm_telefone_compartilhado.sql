begin;
-- Remove somente as quatro verificações de telefone duplicado. Sem DML,
-- sem alterar permissões, validação, autoria ou idempotência por p_id.
do $migration$
declare assinatura text; definicao text; nova text; mensagem text; linhas integer; antes text; depois text;
begin
 select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by id),'')) into antes from public.integracao_crm_cards c;
 for assinatura,mensagem in select * from (values
 ('integracao_crm_privado.cadastrar_lead(uuid,text,text,uuid)', 'Já existe um lead seu com esse telefone neste município. Abra a ficha existente'),
 ('integracao_crm_privado.cadastrar_lead(uuid,text,text,uuid,uuid)', 'Já existe um lead deste responsável com esse telefone neste município. Abra a ficha existente'),
 ('integracao_crm_privado.cadastrar_lead_compartilhado(uuid,text,text,uuid,uuid[])', 'Já existe um lead desse telefone e município para um dos comerciais selecionados'),
 ('integracao_crm_privado.editar_card(uuid,text,text,text,uuid,text,jsonb)', 'Já existe um lead desse telefone e município para um dos comerciais responsáveis')
 ) as alvos(assinatura,mensagem) loop
  definicao:=pg_get_functiondef(assinatura::regprocedure);
  select count(*) into linhas from regexp_split_to_table(definicao,E'\n') as l where strpos(l,mensagem)>0;
  if linhas<>1 then raise exception 'Regra de telefone mudou em %. Revisar antes de aplicar.',assinatura;end if;
  select string_agg(l,E'\n' order by numero) into nova from regexp_split_to_table(definicao,E'\n') with ordinality as partes(l,numero) where strpos(l,mensagem)=0;
  execute nova;
 end loop;
 select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by id),'')) into depois from public.integracao_crm_cards c;
 if antes is distinct from depois then raise exception 'Os registros mudaram durante a migração. Publicação bloqueada.';end if;
end $migration$;
notify pgrst,'reload schema';
commit;
