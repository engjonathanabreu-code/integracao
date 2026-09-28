CREATE OR REPLACE FUNCTION erp_collab_private.mutate(op text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); new_id uuid; serie uuid; members uuid[]; c public.erp_conversas; ev public.erp_eventos;
 req public.erp_exclusoes_chat; start_at timestamptz; end_at timestamptz; original_start timestamptz; original_end timestamptz;
 until_day date; repeat_rule text; n integer:=0; aid uuid; ids jsonb:='[]'; link_type text:=nullif(p->>'entidade_tipo',''); link_id uuid:=nullif(p->>'entidade_id','')::uuid;
begin
 if not erp_collab_private.active_user() then raise exception 'Usuário inativo ou sessão expirada'; end if;
 if op='agenda' then
   if not public.is_admin() then raise exception 'Somente a administração pode criar agendas de ativos'; end if;
   insert into public.erp_agendas(nome,created_by) values(p->>'nome',me) returning id into new_id;
 elsif op='evento' then
   select array_agg(distinct x) into members from (select jsonb_array_elements_text(coalesce(p->'participantes','[]'))::uuid x union select me) s;
   if exists(select 1 from unnest(members) x where not exists(select 1 from public.profiles where id=x and ativo)) then raise exception 'Participante inválido'; end if;
   original_start:=(p->>'inicio')::timestamptz; original_end:=(p->>'fim')::timestamptz;
   if original_start is null or original_end is null or original_end<=original_start then raise exception 'Informe um período válido'; end if;
   repeat_rule:=coalesce(p->>'recorrencia','nenhuma');
   if repeat_rule not in ('nenhuma','diaria','semanal','mensal') then raise exception 'Recorrência inválida'; end if;
   until_day:=coalesce(nullif(p->>'repetir_ate','')::date,(original_start at time zone 'America/Sao_Paulo')::date);
   if until_day<(original_start at time zone 'America/Sao_Paulo')::date or until_day>(original_start at time zone 'America/Sao_Paulo')::date+interval '2 years' then raise exception 'A recorrência deve terminar em até dois anos'; end if;
   aid:=nullif(p->>'agenda_id','')::uuid; serie:=gen_random_uuid();
   -- Serializa as reservas do mesmo ativo, inclusive entre usuários concorrentes.
   if aid is not null then perform 1 from public.erp_agendas where id=aid for update; if not found then raise exception 'Agenda não encontrada'; end if; end if;
   loop
     start_at:=((original_start at time zone 'America/Sao_Paulo')+case repeat_rule when 'diaria' then n*interval '1 day' when 'semanal' then n*interval '7 days' when 'mensal' then n*interval '1 month' else interval '0' end) at time zone 'America/Sao_Paulo';
     end_at:=start_at+(original_end-original_start);
     exit when (start_at at time zone 'America/Sao_Paulo')::date>until_day;
     if n>=366 then raise exception 'Limite de 366 ocorrências por série'; end if;
     if aid is not null and exists(select 1 from public.erp_eventos where agenda_id=aid and status='ativo' and inicio<end_at and fim>start_at) then raise exception 'O ativo já está reservado em uma das datas selecionadas'; end if;
     insert into public.erp_eventos(serie_id,titulo,descricao,inicio,fim,agenda_id,entidade_tipo,entidade_id,participantes,publico,recorrencia,created_by,cor)
       values(serie,p->>'titulo',coalesce(p->>'descricao',''),start_at,end_at,aid,link_type,link_id,members,aid is not null or coalesce((p->>'publico')::boolean,false),repeat_rule,me,'#'||substr(md5(serie::text),1,6)) returning id into new_id;
     ids:=ids||to_jsonb(new_id);
     if link_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,evento_id,autor_id,descricao) values(link_type,link_id,new_id,me,'Evento criado: '||(p->>'titulo')); end if;
     n:=n+1; exit when repeat_rule='nenhuma';
   end loop;
   return jsonb_build_object('id',ids->>0,'ids',ids,'serie_id',serie);
 elsif op in ('evento_status','evento_cor','resposta') then
   select * into ev from public.erp_eventos where id=(p->>'id')::uuid for update;
   if not found or not erp_collab_private.event_visible(ev.id) then raise exception 'Evento indisponível'; end if;
   new_id:=ev.id;
   if op='resposta' then
     if not me=any(ev.participantes) then raise exception 'Você não foi convidado'; end if;
     insert into public.erp_evento_respostas values(ev.id,me,p->>'resposta') on conflict(evento_id,usuario_id) do update set resposta=excluded.resposta;
   else
     if op='evento_cor' and not public.is_admin() then raise exception 'Somente a administração pode alterar cores'; end if;
     if op='evento_status' and ev.created_by<>me and not public.is_admin() then raise exception 'Somente o criador ou a administração pode alterar o evento'; end if;
     if op='evento_status' and (p->>'status' is null or p->>'status' not in ('concluido','cancelado')) then raise exception 'Só é possível concluir ou cancelar um evento'; end if;
     update public.erp_eventos set cor=case when op='evento_cor' then p->>'cor' else cor end,status=case when op='evento_status' then p->>'status' else status end
       where id=ev.id or (coalesce((p->>'serie')::boolean,false) and serie_id=ev.serie_id);
     if ev.entidade_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,evento_id,autor_id,descricao) values(ev.entidade_tipo,ev.entidade_id,ev.id,me,case when op='evento_cor' then 'Cor do evento alterada' else 'Evento: '||(p->>'status') end); end if;
   end if;
 elsif op='conversa' then
   select array_agg(distinct x order by x) into members from (select jsonb_array_elements_text(coalesce(p->'participantes','[]'))::uuid x union select me) s;
   if exists(select 1 from unnest(members) x where not exists(select 1 from public.profiles where id=x and ativo)) then raise exception 'Participante inválido'; end if;
   if p->>'tipo'='grupo' and not erp_collab_private.manager() then raise exception 'Somente a administração ou o diretor de projetos pode criar grupos'; end if;
   if p->>'tipo'='direto' then
     if cardinality(members)<>2 then raise exception 'Selecione outro usuário'; end if;
     perform pg_advisory_xact_lock(hashtextextended(array_to_string(members,','),0));
     select id into new_id from public.erp_conversas where tipo='direto' and participantes=members and excluido_em is null limit 1;
     if found then return jsonb_build_object('id',new_id); end if;
   end if;
   insert into public.erp_conversas(tipo,titulo,entidade_tipo,entidade_id,participantes,created_by)
     values(p->>'tipo',left(coalesce(nullif(p->>'titulo',''),'Conversa direta'),200),link_type,link_id,members,me) returning id into new_id;
   if link_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,conversa_id,autor_id,descricao) values(link_type,link_id,new_id,me,'Grupo de trabalho criado: '||(p->>'titulo')); end if;
 elsif op in ('mensagem','exclusao') then
   select * into c from public.erp_conversas where id=(p->>'conversa_id')::uuid for update;
   if not found or not erp_collab_private.chat_member(c.id) then raise exception 'Conversa indisponível'; end if;
   if op='mensagem' then
     if nullif(p->>'evento_id','') is not null then
       select * into ev from public.erp_eventos where id=(p->>'evento_id')::uuid;
       if not found or not erp_collab_private.event_visible(ev.id) or not (ev.publico or c.participantes<@ev.participantes) then raise exception 'O evento deve incluir todos os participantes da conversa'; end if;
     end if;
     if nullif(p->>'arquivo_path','') is not null and not exists(select 1 from storage.objects where bucket_id='erp-chat' and name=p->>'arquivo_path' and (storage.foldername(name))[1]=c.id::text and (storage.foldername(name))[2]=me::text) then raise exception 'Arquivo não encontrado nesta conversa'; end if;
     insert into public.erp_mensagens(conversa_id,autor_id,texto,arquivo_path,arquivo_nome,evento_id) values(c.id,me,coalesce(p->>'texto',''),nullif(p->>'arquivo_path',''),left(p->>'arquivo_nome',255),nullif(p->>'evento_id','')::uuid) returning id into new_id;
     if c.entidade_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,conversa_id,autor_id,descricao) values(c.entidade_tipo,c.entidade_id,c.id,me,'Mensagem no grupo: '||c.titulo); end if;
   else
     insert into public.erp_exclusoes_chat(conversa_id,solicitado_por,motivo) values(c.id,me,p->>'motivo') returning id into new_id;
   end if;
 elsif op='decidir_exclusao' then
   if not public.is_admin() then raise exception 'Somente a administração pode decidir exclusões'; end if;
   select * into req from public.erp_exclusoes_chat where id=(p->>'id')::uuid for update;
   if not found or req.status<>'pendente' then raise exception 'Solicitação já decidida ou inexistente'; end if;
   if p->>'status' not in ('aprovado','rejeitado') then raise exception 'Decisão inválida'; end if;
   update public.erp_exclusoes_chat set status=p->>'status',decidido_por=me,decidido_em=now() where id=req.id;
   select * into c from public.erp_conversas where id=req.conversa_id for update;
   if p->>'status'='aprovado' then update public.erp_conversas set excluido_em=now() where id=c.id; end if;
   if c.entidade_id is not null then insert into public.erp_colaboracao_historico(entidade_tipo,entidade_id,conversa_id,autor_id,descricao) values(c.entidade_tipo,c.entidade_id,c.id,me,'Solicitação de exclusão: '||(p->>'status')); end if;
   new_id:=req.id;
 elsif op='lida' then
   insert into public.erp_notificacoes_lidas(usuario_id,chave) values(me,left(p->>'chave',300)) on conflict do nothing;
 elsif op='pessoal' then
   insert into public.erp_agenda_pessoal(usuario_id,chave) values(me,left(p->>'chave',300)) on conflict do nothing;
 elsif op='cor_prazo' then
   if not public.is_admin() then raise exception 'Somente a administração pode alterar cores'; end if;
   insert into public.erp_cores_prazos values(left(p->>'chave',300),p->>'cor') on conflict(chave) do update set cor=excluded.cor;
 else raise exception 'Operação desconhecida'; end if;
 return jsonb_build_object('id',new_id);
end $function$

