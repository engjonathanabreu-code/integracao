begin;
-- O fluxo municipal é independente do Kanban interno e da fase de REURB.
alter table public.processos_kanban
 add column etapa_prefeitura text,
 add column etapa_prefeitura_iniciada_em timestamptz,
 add constraint processos_kanban_etapa_prefeitura_check check (etapa_prefeitura is null or etapa_prefeitura in (
 'Parecer Social','Notificações','Parecer setor Planejamento','Parecer setor Meio Ambiente',
 'Parecer setor Defesa Civil','Despacho de Saneamento','CRF'));
alter table public.processos_kanban_historico
 add column fluxo text not null default 'interno',
 add constraint processos_kanban_historico_fluxo_check check (fluxo in ('interno','prefeitura'));
comment on column public.processos_kanban.etapa_prefeitura is 'Etapa de acompanhamento na prefeitura; não altera etapa_atual do fluxo interno.';
-- Só inicializa a autorização quando o usuário libera um andamento explicitamente.
-- Autorizações já existentes, inclusive recusas, são preservadas.
create function integracao_crm_privado.inicializar_ia_andamento() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.visivel_ia is true then
  insert into public.integracao_nucleo_ia(id,habilitado,instrucao)
  values(new.processo_id,true,'Responda somente com os andamentos liberados deste núcleo. Não invente prazos nem exponha observações internas.')
  on conflict(id) do nothing;
 end if;
 return new;
end $$;
revoke all on function integracao_crm_privado.inicializar_ia_andamento() from public,anon,authenticated;
create trigger integracao_inicializar_ia_andamento after insert on public.processos_kanban_andamentos
 for each row when (new.visivel_ia is true) execute function integracao_crm_privado.inicializar_ia_andamento();
-- Contexto público da IA continua sem observações internas nem histórico da equipe.
create or replace function public.integracao_crm_contexto(instalacao text,conta bigint,conversa bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('nucleo',n.nucleo,'etapa_prefeitura',n.etapa_prefeitura,'instrucao',i.instrucao,'andamentos',coalesce((
 select jsonb_agg(jsonb_build_object('status',a.status,'status_operacional',a.status_operacional,'descricao',a.descricao_cliente,
 'data',a.data_atualizacao,'previsao',a.previsao,'orientacao',a.orientacao_ia) order by a.data_atualizacao desc nulls last,a.created_at desc,a.id)
 from public.processos_kanban_andamentos a where a.processo_id=n.id and a.visivel_ia is true),'[]'::jsonb))
 from public.integracao_crm_conversas v join public.integracao_crm_cards c on c.id=v.card_id
 join public.integracao_moradores m on m.referencia_id=c.cliente_id and m.colecao='processos'
 join public.processos_kanban n on n.id::text=m.dados->>'nucleoId' or n.id=(select en.referencia_id from public.integracao_nucleos en where en.registro_id=m.dados->>'nucleoId')
 join public.integracao_nucleo_ia i on i.id=n.id and i.habilitado
 where v.instalacao=$1 and v.conta_id=$2 and v.conversa_id=$3 and v.identidade_confirmada
$$;
commit;
