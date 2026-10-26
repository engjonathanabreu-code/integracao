-- Proposta aditiva: aplicar isoladamente, somente após autorização. Não depende da PR 97.
begin;
-- Bloqueia o RPC legado durante o snapshot e a troca de implementação.
lock table public.integracao_oficios in share row exclusive mode;
create table public.integracao_oficios_versoes (
 id uuid primary key,
 oficio_id uuid not null references public.integracao_oficios(id),
 versao integer not null check(versao>0),
 prefeitura text not null check(length(trim(prefeitura)) between 2 and 200),
 assunto text not null check(length(trim(assunto)) between 3 and 300),
 data_envio date,
 caminho text not null,
 nome_arquivo text not null,
 mime text not null,
 tamanho integer not null check(tamanho between 1 and 10485760),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 resumo text not null check(length(resumo)<=2000),
 resumo_status text not null check(resumo_status in ('ia','revisado','pendente')),
 autor uuid not null references public.profiles(id),
 criado_em timestamptz not null default clock_timestamp(),
 atualizado_em timestamptz not null default clock_timestamp(),
 unique(oficio_id,versao),
 -- Criar uma atualização nunca comprova envio externo.
 check(versao=1 or data_envio is null)
);
create index oficios_versoes_caminho on public.integracao_oficios_versoes(caminho);
create index oficios_versoes_autor on public.integracao_oficios_versoes(autor);
alter table public.integracao_oficios_versoes enable row level security;
revoke all on public.integracao_oficios_versoes from public,anon,authenticated;
grant select on public.integracao_oficios_versoes to authenticated;
create policy oficios_leitura on public.integracao_oficios_versoes for select to authenticated
 using(exists(select 1 from public.profiles where id=auth.uid() and ativo));

insert into public.integracao_oficios_versoes
 (id,oficio_id,versao,prefeitura,assunto,data_envio,caminho,nome_arquivo,mime,tamanho,sha256,resumo,resumo_status,autor,criado_em,atualizado_em)
 select id,id,1,prefeitura,assunto,data_envio,caminho,nome_arquivo,mime,tamanho,sha256,resumo,resumo_status,autor,criado_em,atualizado_em
 from public.integracao_oficios;

create function integracao_crm_privado.oficio_preservar() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Versões de ofícios são imutáveis. Crie uma nova versão';end $$;
create trigger oficio_preservar before update or delete on public.integracao_oficios
 for each row execute function integracao_crm_privado.oficio_preservar();
create trigger oficio_preservar before update or delete on public.integracao_oficios_versoes
 for each row execute function integracao_crm_privado.oficio_preservar();

create function integracao_crm_privado.oficio_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.integracao_oficios_versoes
 (id,oficio_id,versao,prefeitura,assunto,data_envio,caminho,nome_arquivo,mime,tamanho,sha256,resumo,resumo_status,autor,criado_em,atualizado_em)
 values(new.id,new.id,1,new.prefeitura,new.assunto,new.data_envio,new.caminho,new.nome_arquivo,new.mime,new.tamanho,new.sha256,new.resumo,new.resumo_status,new.autor,new.criado_em,new.atualizado_em);
 return new;
end $$;
create trigger oficio_v1 after insert on public.integracao_oficios for each row execute function integracao_crm_privado.oficio_v1();
revoke all on function integracao_crm_privado.oficio_preservar(),integracao_crm_privado.oficio_v1() from public,anon,authenticated;

-- Mantém o contrato de cadastro original, exceto a escrita destrutiva de resumo.
-- O corpo do cadastro permanece no helper privado, indisponível aos clientes.
alter function integracao_crm_privado.oficio_operar(text,jsonb) rename to oficio_registrar_v1;
revoke all on function integracao_crm_privado.oficio_registrar_v1(text,jsonb) from public,anon,authenticated;
create function integracao_crm_privado.oficio_operar(p_acao text,p_dados jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();o public.integracao_oficios;v public.integracao_oficios_versoes;
 atual public.integracao_oficios_versoes;pedido uuid;oficio uuid;
begin
 if u is null or not exists(select 1 from public.profiles where id=u and ativo) then raise exception 'Sessão ativa obrigatória';end if;
 if not integracao_crm_privado.pode_editar_oficios() then raise exception 'Sem permissão para cadastrar ofícios';end if;
 if p_acao='registrar' then return integracao_crm_privado.oficio_registrar_v1(p_acao,p_dados);
 elsif p_acao='resumo' then raise exception 'Crie uma nova versão para atualizar o resumo sem perder o histórico';
 elsif p_acao is distinct from 'atualizar' then raise exception 'Ação inválida';end if;
 pedido:=(p_dados->>'pedido')::uuid;oficio:=(p_dados->>'oficio_id')::uuid;
 if pedido is null or oficio is null then raise exception 'Identificadores obrigatórios';end if;
 perform pg_advisory_xact_lock(hashtextextended('oficio-pedido:'||pedido::text,0));
 select * into v from public.integracao_oficios_versoes where id=pedido;
 if found then
  if v.autor<>u or v.oficio_id<>oficio or v.versao=1 then raise exception 'Pedido inválido';end if;
  return to_jsonb(v);
 end if;
 -- Serializa todas as versões de um ofício; UNIQUE é uma segunda proteção.
 select * into o from public.integracao_oficios where id=oficio for update;
 if not found then raise exception 'Ofício não encontrado';end if;
 select * into atual from public.integracao_oficios_versoes where oficio_id=oficio order by versao desc limit 1;
 if atual.id is distinct from (p_dados->>'base_id')::uuid then
  raise exception 'O ofício recebeu outra versão. Consulte a mais recente e revise sua atualização';
 end if;
 if p_dados->>'data_envio' is not null then raise exception 'Atualizar não registra envio externo';end if;
 if p_dados->>'caminho' is distinct from atual.caminho then
  if split_part(coalesce(p_dados->>'caminho',''), '/',1)<>u::text
   or split_part(p_dados->>'caminho','/',2)<>pedido::text
   or not exists(select 1 from storage.objects where bucket_id='integracao-oficios' and name=p_dados->>'caminho') then
   raise exception 'Anexe o novo arquivo antes de salvar a versão';
  end if;
 else
  if (p_dados->>'nome_arquivo',p_dados->>'mime',(p_dados->>'tamanho')::integer,p_dados->>'sha256')
    is distinct from (atual.nome_arquivo,atual.mime,atual.tamanho,atual.sha256) then
   raise exception 'Os metadados do arquivo anterior devem ser preservados';
  end if;
 end if;
 insert into public.integracao_oficios_versoes
 (id,oficio_id,versao,prefeitura,assunto,data_envio,caminho,nome_arquivo,mime,tamanho,sha256,resumo,resumo_status,autor)
 values(pedido,oficio,atual.versao+1,p_dados->>'prefeitura',p_dados->>'assunto',null,p_dados->>'caminho',p_dados->>'nome_arquivo',p_dados->>'mime',(p_dados->>'tamanho')::integer,p_dados->>'sha256',coalesce(p_dados->>'resumo',''),coalesce(p_dados->>'resumo_status','pendente'),u)
 returning * into v;
 return to_jsonb(v);
end $$;
revoke all on function integracao_crm_privado.oficio_operar(text,jsonb) from public,anon;
grant execute on function integracao_crm_privado.oficio_operar(text,jsonb) to authenticated;
-- Recompila o wrapper para a nova função (a antiga foi renomeada).
create or replace function public.integracao_oficios_operar(p_acao text,p_dados jsonb default '{}') returns jsonb
 language sql security invoker set search_path='' as $$select integracao_crm_privado.oficio_operar(p_acao,p_dados)$$;

alter policy oficios_arquivo_ler on storage.objects using(
 bucket_id='integracao-oficios' and exists(select 1 from public.profiles where id=auth.uid() and ativo)
 and (split_part(name,'/',1)=auth.uid()::text or exists(select 1 from public.integracao_oficios_versoes v where v.caminho=objects.name))
);
do $$begin if to_regprocedure('integracao_crm_privado.sinalizar_revisao()') is not null then
 create trigger integracao_revisao after insert on public.integracao_oficios_versoes for each statement execute function integracao_crm_privado.sinalizar_revisao('metas');
end if;end $$;
notify pgrst,'reload schema';
commit;
