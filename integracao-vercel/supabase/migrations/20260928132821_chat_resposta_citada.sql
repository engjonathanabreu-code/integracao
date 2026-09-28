-- A resposta guarda apenas o vínculo; conteúdo e autor vêm da mensagem original.
alter table public.erp_mensagens add column resposta_id uuid
  references public.erp_mensagens(id) on delete set null;
create index erp_mensagens_resposta_idx on public.erp_mensagens(resposta_id)
  where resposta_id is not null;

-- Preserva todas as operações e verificações da função privada existente.
do $migration$
declare
  definicao text := pg_get_functiondef('erp_collab_private.mutate(text,jsonb)'::regprocedure);
  anterior text := $old$insert into public.erp_mensagens(conversa_id,autor_id,texto,arquivo_path,arquivo_nome,evento_id) values(c.id,me,coalesce(p->>'texto',''),nullif(p->>'arquivo_path',''),left(p->>'arquivo_nome',255),nullif(p->>'evento_id','')::uuid) returning id into new_id;$old$;
  nova text := $new$if nullif(p->>'resposta_id','') is not null and not exists (
       select 1 from public.erp_mensagens original
       where original.id=(p->>'resposta_id')::uuid and original.conversa_id=c.id
     ) then raise exception 'A mensagem citada não pertence a esta conversa ou está indisponível'; end if;
     insert into public.erp_mensagens(conversa_id,autor_id,texto,arquivo_path,arquivo_nome,evento_id,resposta_id)
       values(c.id,me,coalesce(p->>'texto',''),nullif(p->>'arquivo_path',''),left(p->>'arquivo_nome',255),nullif(p->>'evento_id','')::uuid,nullif(p->>'resposta_id','')::uuid) returning id into new_id;$new$;
begin
  if strpos(definicao,anterior)=0 then
    raise exception 'A função do chat mudou. Revise a migração antes de aplicar.';
  end if;
  execute replace(definicao,anterior,nova);
end $migration$;
