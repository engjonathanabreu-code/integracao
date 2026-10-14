-- Escopo próprio do funil; não altera profiles, can_manage_core ou permissões de outros módulos.
create schema if not exists integracao_funil_privado;
revoke all on schema integracao_funil_privado from public, anon;
grant usage on schema integracao_funil_privado to authenticated;
create table public.integracao_funil_comerciais (
 id uuid primary key references public.profiles(id),
 habilitado boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.integracao_funis_institucionais (
 id uuid primary key references public.integracao_funil_comerciais(id),
 dados jsonb not null default '{"versao":1,"cidades":[],"nucleos":[],"historico":[]}',
 revisao bigint not null default 0 check(revisao>=0),
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(dados)='object' and coalesce(jsonb_typeof(dados->'cidades')='array',false) and coalesce(jsonb_typeof(dados->'nucleos')='array',false) and coalesce(jsonb_typeof(dados->'historico')='array',false))
);
alter table public.integracao_funil_comerciais enable row level security;
alter table public.integracao_funis_institucionais enable row level security;
revoke all on public.integracao_funil_comerciais,public.integracao_funis_institucionais from public,anon,authenticated;
grant select on public.integracao_funil_comerciais,public.integracao_funis_institucionais to authenticated;
create policy funil_comerciais_ler on public.integracao_funil_comerciais for select to authenticated using(
 integracao_crm_privado.permite('admin') or (public.is_comercial() and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo))
);
create policy funis_ler on public.integracao_funis_institucionais for select to authenticated using(
 integracao_crm_privado.permite('admin') or (id=(select auth.uid()) and public.is_comercial() and exists(select 1 from public.integracao_funil_comerciais c where c.id=integracao_funis_institucionais.id and c.habilitado))
);
create table integracao_funil_privado.eventos (
 responsavel_id uuid not null references public.integracao_funil_comerciais(id),
 pedido uuid not null,
 ator_id uuid not null references public.profiles(id),
 acao jsonb not null,
 resultado jsonb not null,
 antes_hash text not null,
 depois_hash text not null,
 criado_em timestamptz not null default now(),
 primary key(responsavel_id,pedido)
);
alter table integracao_funil_privado.eventos enable row level security;
revoke all on integracao_funil_privado.eventos from public,anon,authenticated;

create function integracao_funil_privado.chave(nome text,uf text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(normalize(btrim(coalesce(nome,'')),NFD),'[̀-ͯ]','','g'))||'|'||upper(btrim(coalesce(uf,'')));
$$;
revoke all on function integracao_funil_privado.chave(text,text) from public,anon,authenticated;

-- O escritor privado é o único caminho de mutação. A função pública é SECURITY INVOKER.
-- A identidade de edição do funil vem exclusivamente de auth.uid().
create function integracao_funil_privado.salvar(p_revisao bigint,p_acao jsonb,p_pedido uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ator uuid:=auth.uid(); autor text; atual public.integracao_funis_institucionais; repetido integracao_funil_privado.eventos;
 novo jsonb; anterior jsonb; item jsonb; cidade jsonb; lista jsonb; nome text; uf text; etapa text; campo text; registro text; instante timestamptz:=clock_timestamp(); resultado jsonb;
begin
 perform 1 from public.profiles p join public.integracao_funil_comerciais c on c.id=p.id where p.id=ator for share of p,c;
 if ator is null or not integracao_crm_privado.permite('crm') or not exists(select 1 from public.profiles p join public.integracao_funil_comerciais c on c.id=p.id where p.id=ator and p.ativo and p.tipo='Comercial' and c.habilitado) then
  raise exception 'Seu usuário não está habilitado para editar um funil individual.' using errcode='42501';
 end if;
 if p_pedido is null or p_revisao is null or p_revisao<0 or jsonb_typeof(p_acao) is distinct from 'object' then raise exception 'Pedido inválido.' using errcode='22023';end if;
 -- Serializa inclusive a criação e a repetição do primeiro pedido de um mesmo responsável.
 perform pg_advisory_xact_lock(hashtextextended(ator::text,0));
 select * into repetido from integracao_funil_privado.eventos where responsavel_id=ator and pedido=p_pedido;
 if found then
  if repetido.acao is distinct from p_acao then raise exception 'Pedido já utilizado com outro conteúdo.' using errcode='22023';end if;
  return repetido.resultado;
 end if;
 insert into public.integracao_funis_institucionais(id) values(ator) on conflict(id) do nothing;
 select * into atual from public.integracao_funis_institucionais where id=ator for update;
 if atual.revisao<>p_revisao then raise exception 'O funil mudou. Atualize e revise antes de tentar novamente.' using errcode='PT409';end if;
 novo:=atual.dados;
 if p_acao->>'tipo'='cidade' then
  registro:=p_acao->>'id';
  if registro is null or length(registro) not between 1 and 100 then raise exception 'Município inválido.' using errcode='22023';end if;
  select value into anterior from jsonb_array_elements(novo->'cidades') where value->>'id'=registro;
  if anterior is null then raise exception 'Inicie a Prospecção pela Nuvem compartilhada, com responsável explícito.' using errcode='22023';end if;
  foreach campo in array array['municipioId','institucionalId'] loop
   if p_acao ? campo and (p_acao->campo) is distinct from coalesce(anterior->campo,'null'::jsonb) then raise exception 'O fluxo é independente. Preserve as referências anteriores.' using errcode='22023';end if;
  end loop;
  nome:=btrim(coalesce(p_acao->>'nome',''));uf:=upper(btrim(coalesce(p_acao->>'uf','')));
  if length(nome) not between 2 and 120 or uf !~ '^[A-Z]{2}$' then raise exception 'Informe município e UF.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(novo->'cidades') c where c->>'id' is distinct from registro and integracao_funil_privado.chave(c->>'nome',c->>'uf')=integracao_funil_privado.chave(nome,uf)) then raise exception 'A cidade já está no seu fluxo.' using errcode='22023';end if;
  etapa:=coalesce(nullif(p_acao->>'etapa',''),anterior->>'etapa','nuvens');
  if etapa not in ('prospeccao','carteiras') then raise exception 'Etapa inválida.' using errcode='22023';end if;
  if etapa='prospeccao' and (select count(*) from jsonb_array_elements(novo->'cidades') c where c->>'id' is distinct from registro and c->>'etapa'='prospeccao')>=4 then raise exception 'Prospecção já acompanha quatro municípios neste funil.' using errcode='22023';end if;
  item:=coalesce(anterior,'{}'::jsonb)||jsonb_build_object('id',registro,'nome',nome,'uf',uf,'etapa',etapa);
  select coalesce(jsonb_agg(c),'[]'::jsonb) into lista from jsonb_array_elements(novo->'cidades') c where c->>'id' is distinct from registro;
  novo:=jsonb_set(novo,'{cidades}',lista||jsonb_build_array(item));
 elsif p_acao->>'tipo'='nucleo' then
  registro:=p_acao->>'nucleoId';etapa:=p_acao->>'carteira';
  if registro is null or length(registro) not between 1 and 100 or etapa is null or etapa not in ('reserva','preparacao','venda') then raise exception 'Selecione núcleo e etapa válidos.' using errcode='22023';end if;
  select value into anterior from jsonb_array_elements(novo->'nucleos') where value->>'nucleoId'=registro;
  if anterior is not null then
   item:=anterior||jsonb_build_object('carteira',etapa);
  else
   select value into cidade from jsonb_array_elements(novo->'cidades') where value->>'id'=p_acao->>'cidadeId';
   if cidade is null or cidade->>'etapa' not in ('prospeccao','carteiras') then raise exception 'O município do seu fluxo precisa passar pela Prospecção.' using errcode='22023';end if;
   nome:=btrim(coalesce(p_acao->>'nome',''));
   if length(nome) not between 2 and 120 then raise exception 'Informe o nome do núcleo.' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(novo->'nucleos') n where n->>'cidadeId'=cidade->>'id' and integracao_funil_privado.chave(n->>'nome','')=integracao_funil_privado.chave(nome,'')) then raise exception 'Este núcleo já está no município.' using errcode='22023';end if;
   item:=jsonb_build_object('nucleoId',registro,'cidadeId',cidade->>'id','nome',nome,'carteira',etapa);
   select jsonb_agg(case when c->>'id'=cidade->>'id' then c||jsonb_build_object('etapa','carteiras') else c end) into lista from jsonb_array_elements(novo->'cidades') c;
   novo:=jsonb_set(novo,'{cidades}',lista);
  end if;
  select coalesce(jsonb_agg(n),'[]'::jsonb) into lista from jsonb_array_elements(novo->'nucleos') n where n->>'nucleoId' is distinct from registro;
  novo:=jsonb_set(novo,'{nucleos}',lista||jsonb_build_array(item));
 else raise exception 'Ação inválida.' using errcode='22023';end if;
 select p.nome into autor from public.profiles p where p.id=ator;
 novo:=jsonb_set(novo,'{historico}',(novo->'historico')||jsonb_build_array(jsonb_build_object('id',p_pedido,'data',instante,'autor',autor,'autorId',ator,'acao',p_acao)));
 update public.integracao_funis_institucionais set dados=novo,revisao=revisao+1,updated_at=instante where id=ator;
 resultado:=jsonb_build_object('id',ator,'dados',novo,'revisao',atual.revisao+1,'updated_at',instante);
 insert into integracao_funil_privado.eventos(responsavel_id,pedido,ator_id,acao,resultado,antes_hash,depois_hash) values(ator,p_pedido,ator,p_acao,resultado,md5(atual.dados::text),md5(novo::text));
 return resultado;
end $$;
revoke all on function integracao_funil_privado.salvar(bigint,jsonb,uuid) from public,anon;
grant execute on function integracao_funil_privado.salvar(bigint,jsonb,uuid) to authenticated;
create function public.integracao_funil_salvar(p_revisao bigint,p_acao jsonb,p_pedido uuid) returns jsonb language sql security invoker set search_path='' as $$
 select integracao_funil_privado.salvar(p_revisao,p_acao,p_pedido);
$$;
revoke all on function public.integracao_funil_salvar(bigint,jsonb,uuid) from public,anon;
grant execute on function public.integracao_funil_salvar(bigint,jsonb,uuid) to authenticated;

-- Guarda a configuração original como referência administrativa, fora da interface ativa.
create policy funil_legado_restrito on public.integracao_configuracoes as restrictive for all to authenticated
 using(not(colecao='config' and registro_id='funilInstitucional') or integracao_crm_privado.permite('admin'))
 with check(not(colecao='config' and registro_id='funilInstitucional') or integracao_crm_privado.permite('admin'));
create policy funil_legado_restrito on public.integracao_complementos as restrictive for all to authenticated
 using(not(colecao='config' and registro_id='funilInstitucional') or integracao_crm_privado.permite('admin'))
 with check(not(colecao='config' and registro_id='funilInstitucional') or integracao_crm_privado.permite('admin'));
create trigger funis_revisao after insert or update on public.integracao_funis_institucionais for each statement execute function integracao_crm_privado.sinalizar_revisao('crm');
-- A habilitação dos três comerciais confirmados é feita separadamente, sem alterar profiles.

create table public.integracao_funil_nuvem (
 id text primary key check(id='compartilhada'),
 dados jsonb not null,
 revisao bigint not null default 0 check(revisao>=0),
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(dados)='object' and jsonb_typeof(dados->'cidades')='array' and jsonb_typeof(dados->'nucleos')='array' and jsonb_typeof(dados->'historico')='array')
);
alter table public.integracao_funil_nuvem enable row level security;
revoke all on public.integracao_funil_nuvem from public,anon,authenticated;
grant select on public.integracao_funil_nuvem to authenticated;
create policy nuvem_ler on public.integracao_funil_nuvem for select to authenticated using(
 integracao_crm_privado.permite('admin') or (public.is_comercial() and exists(select 1 from public.integracao_funil_comerciais c where c.id=(select auth.uid()) and c.habilitado))
);
-- Copia a Nuvem original integralmente, sem atribuir um responsável. A origem permanece intacta.
-- Se o legado mudar de formato ou ganhar registros em outras etapas, aborta sem adivinhar donos.
do $$declare legado jsonb;begin
 select dados->'valor' into legado from public.integracao_configuracoes where colecao='config' and registro_id='funilInstitucional' for update;
 legado:=coalesce(legado,'{"versao":1,"cidades":[],"nucleos":[],"historico":[]}'::jsonb);
 if jsonb_typeof(legado->'cidades') is distinct from 'array' or jsonb_typeof(legado->'nucleos') is distinct from 'array' or jsonb_typeof(legado->'historico') is distinct from 'array'
 or jsonb_array_length(legado->'nucleos')<>0 or exists(select 1 from jsonb_array_elements(legado->'cidades') c where c->>'etapa' is distinct from 'nuvens' or coalesce(c->>'responsavelId',c->>'responsavel_id',c->>'responsavelNome') is not null)
 then raise exception 'O legado mudou ou contém registros com responsável/fora da Nuvem. Revise antes de migrar.';end if;
 insert into public.integracao_funil_nuvem(id,dados) values('compartilhada',legado);
end $$;
create policy funil_legado_imutavel on public.integracao_configuracoes as restrictive for update to authenticated
 using(not(colecao='config' and registro_id='funilInstitucional')) with check(not(colecao='config' and registro_id='funilInstitucional'));
create policy funil_legado_nao_excluir on public.integracao_configuracoes as restrictive for delete to authenticated using(not(colecao='config' and registro_id='funilInstitucional'));

create table integracao_funil_privado.nuvem_eventos (
 ator_id uuid not null references public.profiles(id),pedido uuid not null,acao jsonb not null,
 resultado jsonb not null,antes_hash text not null,depois_hash text not null,
 criado_em timestamptz not null default now(),primary key(ator_id,pedido)
);
alter table integracao_funil_privado.nuvem_eventos enable row level security;
revoke all on integracao_funil_privado.nuvem_eventos from public,anon,authenticated;

create function integracao_funil_privado.salvar_nuvem(p_revisao bigint,p_funil_revisao bigint,p_acao jsonb,p_pedido uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ator uuid:=auth.uid();admin boolean:=integracao_crm_privado.permite('admin');destino uuid;autor text;
 atual public.integracao_funil_nuvem;funil public.integracao_funis_institucionais;repetido integracao_funil_privado.nuvem_eventos;
 nuvem jsonb;novo jsonb;item jsonb;anterior jsonb;lista jsonb;evento jsonb;etapa text;registro text;nome text;uf text;campo text;
 instante timestamptz:=clock_timestamp();resultado jsonb;antes_funil jsonb;
begin
 perform 1 from public.profiles p where p.id=ator for share;
 perform 1 from public.integracao_funil_comerciais c where c.id=ator for share;
 admin:=integracao_crm_privado.permite('admin');
 if ator is null or not(admin or (public.is_comercial() and exists(select 1 from public.integracao_funil_comerciais c where c.id=ator and c.habilitado))) then raise exception 'Seu usuário não pode editar a Nuvem.' using errcode='42501';end if;
 if p_pedido is null or p_revisao is null or p_revisao<0 or jsonb_typeof(p_acao) is distinct from 'object' or p_acao->>'tipo' is distinct from 'cidade' then raise exception 'Pedido inválido.' using errcode='22023';end if;
 -- A Nuvem é sempre bloqueada antes do destino. Duas atribuições da mesma cidade não podem vencer.
 select * into atual from public.integracao_funil_nuvem where id='compartilhada' for update;
 select * into repetido from integracao_funil_privado.nuvem_eventos where ator_id=ator and pedido=p_pedido;
 if found then
  if repetido.acao is distinct from p_acao then raise exception 'Pedido já utilizado com outro conteúdo.' using errcode='22023';end if;
  if not admin and repetido.resultado->'funil'->>'id' is distinct from ator::text then return jsonb_set(repetido.resultado,'{funil}','null'::jsonb);end if;
  return repetido.resultado;
 end if;
 if atual.id is null or atual.revisao<>p_revisao then raise exception 'A Nuvem mudou. Atualize e revise antes de tentar novamente.' using errcode='PT409';end if;
 nuvem:=atual.dados;registro:=p_acao->>'id';etapa:=p_acao->>'etapa';
 if registro is null or length(registro) not between 1 and 100 or etapa is null or etapa not in ('nuvens','prospeccao') then raise exception 'Município ou etapa inválidos.' using errcode='22023';end if;
 select value into anterior from jsonb_array_elements(nuvem->'cidades') where value->>'id'=registro;
 if etapa='prospeccao' then
  if anterior is null then raise exception 'O município não está mais na Nuvem. Atualize antes de atribuir.' using errcode='PT409';end if;
  if nullif(p_acao->>'responsavelId','') is null then raise exception 'Selecione o responsável pela Prospecção.' using errcode='22023';end if;
  destino:=(p_acao->>'responsavelId')::uuid;
  perform 1 from public.integracao_funil_comerciais c join public.profiles p on p.id=c.id where c.id=destino for share of c,p;
  if not exists(select 1 from public.integracao_funil_comerciais c join public.profiles p on p.id=c.id where c.id=destino and c.habilitado and p.ativo and p.tipo='Comercial') then raise exception 'O responsável não está habilitado para este funil.' using errcode='42501';end if;
 elsif anterior is null then
  -- A devolução é permitida somente para município do próprio ator, sem núcleos associados.
  if public.is_comercial() then destino:=ator;end if;
 end if;
 if destino is not null then
  perform pg_advisory_xact_lock(hashtextextended(destino::text,0));
  if etapa='prospeccao' then insert into public.integracao_funis_institucionais(id) values(destino) on conflict(id) do nothing;end if;
  select * into funil from public.integracao_funis_institucionais where id=destino for update;
  novo:=funil.dados;antes_funil:=novo;
  if etapa='nuvens' then
   select value into item from jsonb_array_elements(novo->'cidades') where value->>'id'=registro;
   if item is not null then
    if p_funil_revisao is null or funil.revisao<>p_funil_revisao then raise exception 'O funil mudou. Atualize antes de devolver à Nuvem.' using errcode='PT409';end if;
    if exists(select 1 from jsonb_array_elements(novo->'nucleos') n where n->>'cidadeId'=registro or (item->>'municipioId' is not null and n->>'municipioId'=item->>'municipioId')) then raise exception 'Preserve os núcleos: este município não pode voltar à Nuvem enquanto houver núcleos associados.' using errcode='22023';end if;
    anterior:=item;
    select coalesce(jsonb_agg(c),'[]'::jsonb) into lista from jsonb_array_elements(novo->'cidades') c where c->>'id' is distinct from registro;
    novo:=jsonb_set(novo,'{cidades}',lista);
   else destino:=null;end if;
  else
   if (select count(*) from jsonb_array_elements(novo->'cidades') c where c->>'etapa'='prospeccao')>=4 then raise exception 'Prospecção já acompanha quatro municípios neste funil.' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(novo->'cidades') c where c->>'id'=registro or integracao_funil_privado.chave(c->>'nome',c->>'uf')=integracao_funil_privado.chave(anterior->>'nome',anterior->>'uf')) then raise exception 'A cidade já está no funil desse responsável.' using errcode='22023';end if;
   novo:=jsonb_set(novo,'{cidades}',(novo->'cidades')||jsonb_build_array(anterior||jsonb_build_object('etapa','prospeccao')));
  end if;
 end if;
 if etapa='nuvens' then
  if anterior is null and exists(select 1 from public.integracao_funis_institucionais f cross join lateral jsonb_array_elements(f.dados->'cidades') c where c->>'id'=registro) then raise exception 'Este município já está atribuído a um funil. Atualize a Nuvem.' using errcode='PT409';end if;
  if nullif(p_acao->>'responsavelId','') is not null then raise exception 'A Nuvem não tem responsável.' using errcode='22023';end if;
  nome:=btrim(coalesce(p_acao->>'nome',''));uf:=upper(btrim(coalesce(p_acao->>'uf','')));
  if length(nome) not between 2 and 120 or uf !~ '^[A-Z]{2}$' then raise exception 'Informe município e UF.' using errcode='22023';end if;
  foreach campo in array array['municipioId','institucionalId'] loop
   if p_acao ? campo and (p_acao->campo) is distinct from coalesce(anterior->campo,'null'::jsonb) then raise exception 'O fluxo é independente. Preserve as referências anteriores.' using errcode='22023';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(nuvem->'cidades') c where c->>'id' is distinct from registro and integracao_funil_privado.chave(c->>'nome',c->>'uf')=integracao_funil_privado.chave(nome,uf)) then raise exception 'A cidade já está na Nuvem.' using errcode='22023';end if;
  item:=(coalesce(anterior,'{}'::jsonb)-'responsavelId'-'responsavelNome'-'responsavel_id')||jsonb_build_object('id',registro,'nome',nome,'uf',uf,'etapa','nuvens');
  select coalesce(jsonb_agg(c),'[]'::jsonb) into lista from jsonb_array_elements(nuvem->'cidades') c where c->>'id' is distinct from registro;
  nuvem:=jsonb_set(nuvem,'{cidades}',lista||jsonb_build_array(item));
 else
  select coalesce(jsonb_agg(c),'[]'::jsonb) into lista from jsonb_array_elements(nuvem->'cidades') c where c->>'id' is distinct from registro;
  nuvem:=jsonb_set(nuvem,'{cidades}',lista);
 end if;
 select p.nome into autor from public.profiles p where p.id=ator;
 evento:=jsonb_build_object('id',p_pedido,'data',instante,'autor',autor,'autorId',ator,'acao',p_acao);
 nuvem:=jsonb_set(nuvem,'{historico}',(nuvem->'historico')||jsonb_build_array(evento));
 if destino is not null then
  novo:=jsonb_set(novo,'{historico}',(novo->'historico')||jsonb_build_array(evento));
  update public.integracao_funis_institucionais set dados=novo,revisao=revisao+1,updated_at=instante where id=destino;
 end if;
 update public.integracao_funil_nuvem set dados=nuvem,revisao=revisao+1,updated_at=instante where id='compartilhada';
 resultado:=jsonb_build_object('nuvem',jsonb_build_object('id','compartilhada','dados',nuvem,'revisao',atual.revisao+1),'funil',case when destino is not null and (destino=ator or admin) then jsonb_build_object('id',destino,'dados',novo,'revisao',funil.revisao+1) else null end);
 insert into integracao_funil_privado.nuvem_eventos(ator_id,pedido,acao,resultado,antes_hash,depois_hash) values(ator,p_pedido,p_acao,resultado,md5(jsonb_build_object('nuvem',atual.dados,'funil',antes_funil)::text),md5(jsonb_build_object('nuvem',nuvem,'funil',case when destino is not null then novo else null end)::text));
 return resultado;
end $$;
revoke all on function integracao_funil_privado.salvar_nuvem(bigint,bigint,jsonb,uuid) from public,anon;
grant execute on function integracao_funil_privado.salvar_nuvem(bigint,bigint,jsonb,uuid) to authenticated;
create function public.integracao_nuvem_salvar(p_revisao bigint,p_funil_revisao bigint,p_acao jsonb,p_pedido uuid) returns jsonb language sql security invoker set search_path='' as $$select integracao_funil_privado.salvar_nuvem(p_revisao,p_funil_revisao,p_acao,p_pedido);$$;
revoke all on function public.integracao_nuvem_salvar(bigint,bigint,jsonb,uuid) from public,anon;
grant execute on function public.integracao_nuvem_salvar(bigint,bigint,jsonb,uuid) to authenticated;
create trigger nuvem_revisao after update on public.integracao_funil_nuvem for each statement execute function integracao_crm_privado.sinalizar_revisao('crm');
