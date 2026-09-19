-- Preparação estrutural. Não importa nem atualiza cadastros existentes.
begin;
create schema if not exists integracao_crm_privado;
revoke all on schema integracao_crm_privado from public;
grant usage on schema integracao_crm_privado to authenticated, service_role;

create function integracao_crm_privado.permite(modulo text) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo and
 (p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos') or
 (modulo='crm' and p.tipo='Comercial') or (modulo='semanal' and p.tipo='Pós-protocolo') or (modulo='marketing' and p.tipo='Marketing')))
$$;
revoke all on function integracao_crm_privado.permite(text) from public;
grant execute on function integracao_crm_privado.permite(text) to authenticated,service_role;

create table public.integracao_crm_cards (
 id uuid primary key default gen_random_uuid(), cliente_id uuid unique references public.fin_receb_clientes(id),
 responsavel_id uuid references public.profiles(id), status text not null default 'Cliente novo' check(status in ('Cliente novo','Negociação','Contrato','Cliente ativo')),
 lead_nome text, lead_telefone text, lead_cidade text, origem text not null default 'manual', origem_id text unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(cliente_id is not null or nullif(trim(lead_nome),'') is not null)
);
create index on public.integracao_crm_cards(responsavel_id);
create function integracao_crm_privado.card_permitido(card uuid) returns boolean language sql stable security definer set search_path='' as $$
 select integracao_crm_privado.permite('crm') and exists(select 1 from public.integracao_crm_cards c where c.id=card and (c.responsavel_id=auth.uid() or integracao_crm_privado.permite('admin')))
$$;
revoke all on function integracao_crm_privado.card_permitido(uuid) from public;
grant execute on function integracao_crm_privado.card_permitido(uuid) to authenticated,service_role;

create table public.integracao_crm_tarefas (
 id uuid primary key default gen_random_uuid(), card_id uuid not null references public.integracao_crm_cards(id),
 responsavel_id uuid not null default auth.uid() references public.profiles(id), titulo text not null check(length(trim(titulo))>0),
 prazo date not null, checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array'), concluida boolean not null default false,
 created_at timestamptz not null default now(), origem_id text unique
);
create index on public.integracao_crm_tarefas(responsavel_id,prazo);
create index on public.integracao_crm_tarefas(card_id);
create table public.integracao_crm_atendimentos (
 id uuid primary key default gen_random_uuid(), card_id uuid not null references public.integracao_crm_cards(id),
 data timestamptz not null, relato text not null check(length(trim(relato))>0), autor_id uuid default auth.uid() references public.profiles(id),
 origem text not null default 'manual', origem_id text unique, created_at timestamptz not null default now()
);
create index on public.integracao_crm_atendimentos(card_id);
create table public.integracao_crm_conversas (
 id uuid primary key default gen_random_uuid(), card_id uuid not null references public.integracao_crm_cards(id),
 instalacao text not null, conta_id bigint not null, conversa_id bigint not null, contato_id bigint not null,
 identidade_confirmada boolean not null default false, created_at timestamptz not null default now(),
 unique(instalacao,conta_id,conversa_id)
);
create index on public.integracao_crm_conversas(card_id);
create table public.integracao_crm_mensagens (
 id uuid primary key default gen_random_uuid(), conversa_id uuid not null references public.integracao_crm_conversas(id),
 mensagem_id bigint not null, conteudo text not null default '', privada boolean not null default false,
 autor text, direcao text, anexos jsonb not null default '[]', data timestamptz not null,
 unique(conversa_id,mensagem_id)
);
create index on public.integracao_crm_mensagens(conversa_id);
create table public.integracao_crm_agentes (
 id uuid primary key default gen_random_uuid(), instalacao text not null, conta_id bigint not null,
 agente_id bigint not null, usuario_id uuid not null references public.profiles(id), unique(instalacao,conta_id,agente_id)
);
create table public.integracao_crm_auditoria (
 id uuid primary key default gen_random_uuid(), tabela text not null, registro_id uuid not null,
 acao text not null, autor_id uuid, anterior jsonb, atual jsonb, created_at timestamptz not null default now()
);
create function integracao_crm_privado.auditar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.integracao_crm_auditoria(tabela,registro_id,acao,autor_id,anterior,atual)
 values(tg_table_name,new.id,tg_op,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new)); return new;
end $$;
revoke all on function integracao_crm_privado.auditar() from public;

-- Associa somente NOVOS cadastros criados após a instalação. Não percorre os existentes.
create function integracao_crm_privado.novo_cliente() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if integracao_crm_privado.permite('crm') then
 insert into public.integracao_crm_cards(cliente_id,responsavel_id) values(new.id,auth.uid());
 end if; return new;
end $$;
revoke all on function integracao_crm_privado.novo_cliente() from public;
create trigger integracao_crm_novo_cliente after insert on public.fin_receb_clientes for each row execute function integracao_crm_privado.novo_cliente();

-- Políticas adicionais: preservam o acesso financeiro existente e liberam o cadastro
-- necessário ao CRM. Comercial só lê/edita clientes do próprio funil.
create policy integracao_crm_clientes_ler on public.fin_receb_clientes for select to authenticated
 using(integracao_crm_privado.permite('admin') or exists(select 1 from public.integracao_crm_cards c where c.cliente_id=fin_receb_clientes.id));
create policy integracao_crm_clientes_criar on public.fin_receb_clientes for insert to authenticated
 with check(integracao_crm_privado.permite('crm'));
create policy integracao_crm_clientes_editar on public.fin_receb_clientes for update to authenticated
 using(integracao_crm_privado.permite('admin') or exists(select 1 from public.integracao_crm_cards c where c.cliente_id=fin_receb_clientes.id))
 with check(integracao_crm_privado.permite('admin') or exists(select 1 from public.integracao_crm_cards c where c.cliente_id=fin_receb_clientes.id));
create policy integracao_modulos_municipios_ler on public.fin_receb_municipios for select to authenticated
 using(integracao_crm_privado.permite('crm') or integracao_crm_privado.permite('semanal') or integracao_crm_privado.permite('marketing'));
create policy integracao_modulos_remessas_ler on public.fin_receb_remessas for select to authenticated
 using(integracao_crm_privado.permite('crm') or integracao_crm_privado.permite('semanal') or integracao_crm_privado.permite('marketing'));
grant select,insert,update on public.fin_receb_clientes to authenticated;
grant select on public.fin_receb_municipios,public.fin_receb_remessas to authenticated;

create table public.integracao_semanal_municipios (
 id uuid primary key default gen_random_uuid(), municipio_id uuid not null references public.fin_receb_municipios(id),
 nucleo_id uuid references public.processos_kanban(id), andamento_id uuid references public.processos_kanban_andamentos(id),
 semana_padrao integer not null check(semana_padrao between 1 and 4), telefone text, observacoes text,
 ativo boolean not null default true, origem_id text unique, created_at timestamptz not null default now()
);
create table public.integracao_semanal_semanas (
 id uuid primary key default gen_random_uuid(), municipio_id uuid not null references public.integracao_semanal_municipios(id),
 ano integer not null check(ano between 2000 and 2200), mes integer not null check(mes between 1 and 12),
 semana integer not null check(semana between 1 and 4), concluido boolean not null default false,
 concluido_em timestamptz, concluido_por uuid references public.profiles(id), origem_id text unique,
 unique(municipio_id,ano,mes,semana)
);
create table public.integracao_semanal_registros (
 id uuid primary key default gen_random_uuid(), semana_id uuid not null references public.integracao_semanal_semanas(id),
 comentario text not null check(length(trim(comentario))>0), created_by uuid default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), origem_id text unique
);
create table public.integracao_semanal_arquivos (
 id uuid primary key default gen_random_uuid(), semana_id uuid not null references public.integracao_semanal_semanas(id),
 nome text not null, caminho text not null unique, created_at timestamptz not null default now(), origem_id text unique
);
create table public.integracao_semanal_exclusoes (
 id uuid primary key default gen_random_uuid(), municipio_id uuid not null references public.integracao_semanal_municipios(id),
 status text not null default 'pendente' check(status in ('pendente','aprovado','recusado')),
 solicitado_por uuid not null default auth.uid(), motivo text not null, decidido_por uuid, decidido_em timestamptz,
 created_at timestamptz not null default now()
);
create unique index on public.integracao_semanal_exclusoes(municipio_id) where status='pendente';
create table public.integracao_marketing_etapas (
 id uuid primary key default gen_random_uuid(), fase_numero integer not null, fase_nome text not null,
 codigo text not null unique, ordem integer not null, titulo text not null, descricao text, origem_id text unique
);
create table public.integracao_marketing_projetos (
 id uuid primary key default gen_random_uuid(), nucleo_id uuid not null unique references public.processos_kanban(id),
 observacoes text, ativo boolean not null default true, created_at timestamptz not null default now(), origem_id text unique
);
create table public.integracao_marketing_progresso (
 id uuid primary key default gen_random_uuid(), projeto_id uuid not null references public.integracao_marketing_projetos(id),
 etapa_id uuid not null references public.integracao_marketing_etapas(id), concluida boolean not null default false,
 concluida_em timestamptz, concluida_por uuid references public.profiles(id), observacao text, origem_id text unique,
 unique(projeto_id,etapa_id)
);
create table public.integracao_nucleo_ia (
 id uuid primary key references public.processos_kanban(id), instrucao text not null default '', habilitado boolean not null default false
);

do $$ declare t text; begin
 foreach t in array array['integracao_crm_cards','integracao_crm_tarefas','integracao_crm_atendimentos','integracao_crm_conversas','integracao_crm_mensagens','integracao_crm_agentes','integracao_crm_auditoria','integracao_semanal_municipios','integracao_semanal_semanas','integracao_semanal_registros','integracao_semanal_arquivos','integracao_semanal_exclusoes','integracao_marketing_etapas','integracao_marketing_projetos','integracao_marketing_progresso','integracao_nucleo_ia'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if t not in ('integracao_crm_auditoria','integracao_crm_mensagens') then
 execute format('create trigger auditoria after insert or update on public.%I for each row execute function integracao_crm_privado.auditar()',t);
 end if;
 end loop;
end $$;
revoke insert,update on public.integracao_crm_auditoria,public.integracao_crm_conversas,public.integracao_crm_mensagens from authenticated;
create policy cards_ler on public.integracao_crm_cards for select to authenticated using(integracao_crm_privado.card_permitido(id));
create policy cards_alterar on public.integracao_crm_cards for update to authenticated using(integracao_crm_privado.card_permitido(id)) with check(integracao_crm_privado.card_permitido(id));
-- Cadastro e transferência são operações específicas; não permitir mudar cliente/responsável via PATCH.
revoke insert,update on public.integracao_crm_cards from authenticated;
grant update(status) on public.integracao_crm_cards to authenticated;
create policy tarefas_ler on public.integracao_crm_tarefas for select to authenticated using(integracao_crm_privado.permite('crm') and (responsavel_id=auth.uid() or integracao_crm_privado.permite('admin')));
create policy tarefas_criar on public.integracao_crm_tarefas for insert to authenticated with check(integracao_crm_privado.card_permitido(card_id) and (responsavel_id=auth.uid() or integracao_crm_privado.permite('admin')));
create policy tarefas_alterar on public.integracao_crm_tarefas for update to authenticated using(integracao_crm_privado.permite('crm') and (responsavel_id=auth.uid() or integracao_crm_privado.permite('admin'))) with check(integracao_crm_privado.permite('crm') and (responsavel_id=auth.uid() or integracao_crm_privado.permite('admin')));
revoke update on public.integracao_crm_tarefas from authenticated;
grant update(titulo,prazo,checklist,concluida) on public.integracao_crm_tarefas to authenticated;
create policy atendimentos_ler on public.integracao_crm_atendimentos for select to authenticated using(integracao_crm_privado.card_permitido(card_id));
create policy atendimentos_criar on public.integracao_crm_atendimentos for insert to authenticated with check(integracao_crm_privado.card_permitido(card_id) and autor_id=auth.uid() and origem='manual');
create policy conversas_ler on public.integracao_crm_conversas for select to authenticated using(integracao_crm_privado.card_permitido(card_id));
create policy mensagens_ler on public.integracao_crm_mensagens for select to authenticated using(exists(select 1 from public.integracao_crm_conversas c where c.id=integracao_crm_mensagens.conversa_id));
create policy agentes_admin on public.integracao_crm_agentes for all to authenticated using(integracao_crm_privado.permite('admin')) with check(integracao_crm_privado.permite('admin'));
create policy auditoria_admin on public.integracao_crm_auditoria for select to authenticated using(integracao_crm_privado.permite('admin'));
do $$ declare t text; begin
 foreach t in array array['integracao_semanal_municipios','integracao_semanal_semanas','integracao_semanal_registros','integracao_semanal_arquivos','integracao_nucleo_ia'] loop
 execute format('create policy acesso on public.%I for all to authenticated using(integracao_crm_privado.permite(''semanal'')) with check(integracao_crm_privado.permite(''semanal''))',t);
 end loop;
 foreach t in array array['integracao_marketing_etapas','integracao_marketing_projetos','integracao_marketing_progresso'] loop
 execute format('create policy acesso on public.%I for all to authenticated using(integracao_crm_privado.permite(''marketing'')) with check(integracao_crm_privado.permite(''marketing''))',t);
 end loop;
end $$;
revoke update on public.integracao_semanal_municipios from authenticated;
grant update(municipio_id,nucleo_id,andamento_id,semana_padrao,telefone,observacoes) on public.integracao_semanal_municipios to authenticated;
create policy exclusoes_ler on public.integracao_semanal_exclusoes for select to authenticated using(integracao_crm_privado.permite('semanal'));
create policy exclusoes_criar on public.integracao_semanal_exclusoes for insert to authenticated with check(integracao_crm_privado.permite('semanal') and solicitado_por=auth.uid() and status='pendente' and decidido_por is null and decidido_em is null);

create function public.integracao_crm_transferir(card uuid, destino uuid) returns void language plpgsql security invoker set search_path='' as $$
begin perform integracao_crm_privado.transferir(card,destino); end $$;
create function integracao_crm_privado.transferir(card uuid,destino uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.integracao_crm_cards where id=card for update;
 if not integracao_crm_privado.card_permitido(card) then raise exception 'Sem permissão'; end if;
 if not exists(select 1 from public.profiles where id=destino and ativo and tipo='Comercial') then raise exception 'Escolha um comercial ativo'; end if;
 update public.integracao_crm_cards set responsavel_id=destino,updated_at=now() where id=card;
end $$;
revoke all on function integracao_crm_privado.transferir(uuid,uuid), public.integracao_crm_transferir(uuid,uuid) from public;
grant execute on function integracao_crm_privado.transferir(uuid,uuid), public.integracao_crm_transferir(uuid,uuid) to authenticated;

create function integracao_crm_privado.decidir(pedido uuid,aprovar boolean) returns void language plpgsql security definer set search_path='' as $$
declare alvo uuid; begin
 if not integracao_crm_privado.permite('admin') then raise exception 'Sem permissão'; end if;
 select municipio_id into alvo from public.integracao_semanal_exclusoes where id=pedido and status='pendente' for update;
 if alvo is null then raise exception 'Pedido não está pendente'; end if;
 update public.integracao_semanal_exclusoes set status=case when aprovar then 'aprovado' else 'recusado' end,decidido_por=auth.uid(),decidido_em=now() where id=pedido;
 if aprovar then update public.integracao_semanal_municipios set ativo=false where id=alvo; end if;
end $$;
create function public.integracao_semanal_decidir(pedido uuid,aprovar boolean) returns void language sql security invoker set search_path='' as $$select integracao_crm_privado.decidir(pedido,aprovar)$$;
revoke all on function integracao_crm_privado.decidir(uuid,boolean),public.integracao_semanal_decidir(uuid,boolean) from public;
grant execute on function integracao_crm_privado.decidir(uuid,boolean),public.integracao_semanal_decidir(uuid,boolean) to authenticated;

create view public.integracao_crm_funil with(security_invoker=true) as
 select c.*,f.nome,f.cpf_cnpj,f.codigo,f.municipio_id,f.remessa_id,m.nome municipio,r.nome remessa,
 e.dados->'requerente'->>'telefone' telefone
 from public.integracao_crm_cards c left join public.fin_receb_clientes f on f.id=c.cliente_id
 left join public.fin_receb_municipios m on m.id=f.municipio_id left join public.fin_receb_remessas r on r.id=f.remessa_id
 left join public.integracao_moradores e on e.referencia_id=f.id and e.colecao='processos';
grant select on public.integracao_crm_funil to authenticated;

-- Confirmar identidade é uma decisão humana, auditada e limitada ao funil autorizado.
create function integracao_crm_privado.vincular(card uuid,cliente uuid) returns void language plpgsql security definer set search_path='' as $$
declare existente uuid; begin
 perform 1 from public.integracao_crm_cards where id=card for update;
 if not integracao_crm_privado.card_permitido(card) then raise exception 'Sem permissão'; end if;
 if exists(select 1 from public.integracao_crm_cards where id=card and cliente_id is not null and cliente_id<>cliente) then raise exception 'Contato já vinculado a outro cliente'; end if;
 select id into existente from public.integracao_crm_cards where cliente_id=cliente for update;
 if existente is not null and existente<>card then
   if not integracao_crm_privado.card_permitido(existente) then raise exception 'Cliente pertence a outro comercial; solicite revisão administrativa'; end if;
   update public.integracao_crm_conversas set card_id=existente,identidade_confirmada=true where card_id=card;
   update public.integracao_crm_atendimentos set card_id=existente where card_id=card;
   update public.integracao_crm_tarefas set card_id=existente where card_id=card;
   -- O lead original permanece no histórico, sem apagar registros.
   update public.integracao_crm_cards set origem='vinculado',responsavel_id=null where id=card;
 else
   update public.integracao_crm_cards set cliente_id=cliente,updated_at=now() where id=card;
   update public.integracao_crm_conversas set identidade_confirmada=true where card_id=card;
 end if;
end $$;
create function public.integracao_crm_vincular(card uuid,cliente uuid) returns void language sql security invoker set search_path='' as $$select integracao_crm_privado.vincular(card,cliente)$$;
revoke all on function integracao_crm_privado.vincular(uuid,uuid),public.integracao_crm_vincular(uuid,uuid) from public;
grant execute on function integracao_crm_privado.vincular(uuid,uuid),public.integracao_crm_vincular(uuid,uuid) to authenticated;

-- Executado exclusivamente pelo receptor autenticado. Transação única e trava por contato.
create function public.integracao_crm_receber(evento jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare card uuid; conversa uuid; responsavel uuid; chave text;
begin
 chave=concat(evento->>'instalacao',':',evento->>'conta_id',':',evento->>'contato_id');
 perform pg_advisory_xact_lock(hashtextextended(chave,0));
 select c.card_id into card from public.integracao_crm_conversas c where c.instalacao=evento->>'instalacao' and c.conta_id=(evento->>'conta_id')::bigint and c.contato_id=(evento->>'contato_id')::bigint order by c.created_at desc limit 1;
 select a.usuario_id into responsavel from public.integracao_crm_agentes a join public.profiles p on p.id=a.usuario_id and p.ativo and p.tipo='Comercial'
 where a.instalacao=evento->>'instalacao' and a.conta_id=(evento->>'conta_id')::bigint and a.agente_id=nullif(evento->>'agente_id','')::bigint;
 if card is null then
   insert into public.integracao_crm_cards(responsavel_id,lead_nome,lead_telefone,origem,origem_id)
   values(responsavel,coalesce(nullif(evento->>'nome',''),'Contato Chatwoot'),evento->>'telefone','chatwoot',chave)
   on conflict(origem_id) do update set origem_id=excluded.origem_id returning id into card;
 elsif responsavel is not null then
   update public.integracao_crm_cards set responsavel_id=responsavel where id=card and responsavel_id is null and origem<>'vinculado';
 end if;
 insert into public.integracao_crm_conversas(card_id,instalacao,conta_id,conversa_id,contato_id,identidade_confirmada)
 values(card,evento->>'instalacao',(evento->>'conta_id')::bigint,(evento->>'conversa_id')::bigint,(evento->>'contato_id')::bigint,
 exists(select 1 from public.integracao_crm_conversas c where c.card_id=card and c.instalacao=evento->>'instalacao' and c.conta_id=(evento->>'conta_id')::bigint and c.contato_id=(evento->>'contato_id')::bigint and c.identidade_confirmada))
 on conflict(instalacao,conta_id,conversa_id) do update set conversa_id=excluded.conversa_id returning id into conversa;
 if nullif(evento->>'mensagem_id','') is not null then
 insert into public.integracao_crm_mensagens(conversa_id,mensagem_id,conteudo,privada,autor,direcao,anexos,data)
 values(conversa,(evento->>'mensagem_id')::bigint,coalesce(evento->>'conteudo',''),coalesce((evento->>'privada')::boolean,false),evento->>'autor',evento->>'direcao',coalesce(evento->'anexos','[]'::jsonb),(evento->>'data')::timestamptz)
 on conflict(conversa_id,mensagem_id) do nothing;
 end if;
 return conversa;
end $$;
revoke all on function public.integracao_crm_receber(jsonb) from public,anon,authenticated;
grant execute on function public.integracao_crm_receber(jsonb) to service_role;

-- Consulta somente pela conversa confirmada. Nunca devolve notas internas ou cadastro completo.
create function public.integracao_crm_contexto(instalacao text,conta bigint,conversa bigint) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('nucleo',n.nucleo,'instrucao',i.instrucao,'andamentos',coalesce((select jsonb_agg(jsonb_build_object('status',a.status,'descricao',a.descricao_cliente,'data',a.data_atualizacao,'previsao',a.previsao,'orientacao',a.orientacao_ia) order by a.data_atualizacao desc) from public.processos_kanban_andamentos a where a.processo_id=n.id and a.visivel_ia is true),'[]'::jsonb))
 from public.integracao_crm_conversas v join public.integracao_crm_cards c on c.id=v.card_id
 join public.integracao_moradores m on m.referencia_id=c.cliente_id and m.colecao='processos'
 join public.integracao_nucleos en on en.registro_id=m.dados->>'nucleoId'
 join public.processos_kanban n on n.id=en.referencia_id
 join public.integracao_nucleo_ia i on i.id=n.id and i.habilitado
 where v.instalacao=$1 and v.conta_id=$2 and v.conversa_id=$3 and v.identidade_confirmada
$$;
revoke all on function public.integracao_crm_contexto(text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.integracao_crm_contexto(text,bigint,bigint) to service_role;

-- Bucket privado: não sobrescrever anexos; a autorização acompanha o módulo.
insert into storage.buckets(id,name,public,file_size_limit) values('integracao-semanal','integracao-semanal',false,26214400) on conflict(id) do nothing;
create policy integracao_semanal_arquivo_ler on storage.objects for select to authenticated using(bucket_id='integracao-semanal' and integracao_crm_privado.permite('semanal'));
create policy integracao_semanal_arquivo_criar on storage.objects for insert to authenticated with check(bucket_id='integracao-semanal' and integracao_crm_privado.permite('semanal') and exists(select 1 from public.integracao_semanal_semanas s where s.id::text=split_part(name,'/',1)));
-- Preserva as políticas existentes e acrescenta restrição de escrita dos andamentos.
alter table public.processos_kanban_andamentos alter column visivel_ia set default false;
grant insert,update on public.processos_kanban_andamentos to authenticated;
create policy integracao_andamentos_criar_permitido on public.processos_kanban_andamentos for insert to authenticated with check(integracao_crm_privado.permite('semanal'));
create policy integracao_andamentos_alterar_permitido on public.processos_kanban_andamentos for update to authenticated using(integracao_crm_privado.permite('semanal')) with check(integracao_crm_privado.permite('semanal'));
create policy integracao_andamentos_inserir on public.processos_kanban_andamentos as restrictive for insert to authenticated with check(integracao_crm_privado.permite('semanal'));
create policy integracao_andamentos_editar on public.processos_kanban_andamentos as restrictive for update to authenticated using(integracao_crm_privado.permite('semanal')) with check(integracao_crm_privado.permite('semanal'));
create policy integracao_andamentos_excluir on public.processos_kanban_andamentos as restrictive for delete to authenticated using(false);
revoke update on public.integracao_crm_atendimentos,public.integracao_semanal_registros,public.integracao_semanal_arquivos from authenticated;
create function integracao_crm_privado.validar() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='integracao_crm_tarefas' then
   if exists(select 1 from jsonb_array_elements(new.checklist) x where jsonb_typeof(x)<>'object' or nullif(trim(x->>'texto'),'') is null or jsonb_typeof(x->'concluido') is distinct from 'boolean') then raise exception 'Checklist inválido'; end if;
   if new.concluida and exists(select 1 from jsonb_array_elements(new.checklist) x where (x->>'concluido')::boolean is not true) then raise exception 'Conclua os itens do checklist'; end if;
 elsif tg_table_name='integracao_semanal_registros' then
   if auth.uid() is not null then new.created_by=auth.uid();new.created_at=now();end if;
 elsif tg_table_name='integracao_semanal_semanas' then
   if auth.uid() is not null then new.concluido_por=case when new.concluido then auth.uid() else null end;new.concluido_em=case when new.concluido then now() else null end;end if;
 elsif tg_table_name='integracao_marketing_progresso' then
   if auth.uid() is not null then new.concluida_por=case when new.concluida then auth.uid() else null end;new.concluida_em=case when new.concluida then now() else null end;end if;
 elsif tg_table_name='integracao_semanal_municipios' then
   if new.andamento_id is not null and not exists(select 1 from public.processos_kanban_andamentos a where a.id=new.andamento_id and a.processo_id=new.nucleo_id) then raise exception 'Andamento não pertence ao núcleo escolhido';end if;
 elsif tg_table_name='integracao_semanal_arquivos' then
   if split_part(new.caminho,'/',1)<>new.semana_id::text then raise exception 'Arquivo não pertence à semana';end if;
 end if;
 return new;
end $$;
revoke all on function integracao_crm_privado.validar() from public;
do $$ declare t text; begin
 foreach t in array array['integracao_crm_tarefas','integracao_semanal_registros','integracao_semanal_semanas','integracao_marketing_progresso','integracao_semanal_municipios','integracao_semanal_arquivos'] loop
 execute format('create trigger validar before insert or update on public.%I for each row execute function integracao_crm_privado.validar()',t);
 end loop;
end $$;
create index on public.integracao_semanal_registros(semana_id);
create index on public.integracao_semanal_arquivos(semana_id);
create index on public.integracao_marketing_progresso(etapa_id);
create function integracao_crm_privado.sincronizar_status() returns trigger language plpgsql security definer set search_path='' as $$
declare card uuid; etapa text; begin
 if tg_table_name='integracao_crm_cards' then
   if new.status is distinct from old.status and new.cliente_id is not null then
     update public.integracao_moradores set dados=jsonb_set(dados,'{requerente}',coalesce(dados->'requerente','{}'::jsonb)||jsonb_build_object('statusCRM',new.status))
     where referencia_id=new.cliente_id and colecao='processos' and dados->'requerente'->>'statusCRM' is distinct from new.status;
   end if;
 else
   etapa=new.dados->'requerente'->>'statusCRM';
   if etapa is distinct from old.dados->'requerente'->>'statusCRM' then
     select id into card from public.integracao_crm_cards where cliente_id=new.referencia_id and status is distinct from etapa;
     if card is not null then
       if not integracao_crm_privado.card_permitido(card) then raise exception 'Status comercial só pode ser alterado pelo responsável ou administrador';end if;
       update public.integracao_crm_cards set status=etapa where id=card;
     end if;
   end if;
 end if;
 return new;
end $$;
revoke all on function integracao_crm_privado.sincronizar_status() from public;
create trigger integracao_crm_status after update of status on public.integracao_crm_cards for each row execute function integracao_crm_privado.sincronizar_status();
create trigger integracao_cadastro_status after update of dados on public.integracao_moradores for each row execute function integracao_crm_privado.sincronizar_status();
commit;
