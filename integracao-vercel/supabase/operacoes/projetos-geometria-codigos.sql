-- Preparação somente: não aplicada à produção. Gerar migration via CLI antes da publicação.
-- Requer backup recuperável verificado. Não altera qualquer registro existente.
-- Reversão: reverter interface; preservar reservas, sequência e função de consumo.
-- Reversão funcional em reversao-projetos-geometria-codigos.sql, sem apagar dados.
begin;
create schema if not exists integracao_projetos_privado;
revoke all on schema integracao_projetos_privado from public,anon;
grant usage on schema integracao_projetos_privado to authenticated;

create or replace function integracao_projetos_privado.permite(acao text)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo and
   case acao
    when 'mapa' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia','Projetos','Projeto','Comercial','Atendimentos')
    when 'geometria' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia','Projetos','Projeto')
    when 'memorial_nucleo' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia','Projetos','Projeto')
    when 'area_unidade' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia','Projetos','Projeto')
    when 'lote_quadra' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Projetos','Projeto')
    when 'memorial_unidade' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia')
    else false end
   or (p.id=auth.uid() and p.ativo and lower(btrim(p.setor)) in ('projeto','projetos')
       and acao in ('mapa','geometria','memorial_nucleo','area_unidade','lote_quadra')))
$$;
revoke all on function integracao_projetos_privado.permite(text) from public,anon;
grant execute on function integracao_projetos_privado.permite(text) to authenticated;

-- Valida somente geometrias novas/alteradas. O levantamento UTM anterior não é
-- convertido nem regravado; poligono é a representação geográfica já existente.
create or replace function integracao_projetos_privado.validar_anel(anel jsonb,fechado boolean default true)
returns integer language plpgsql immutable set search_path='' as $$
declare ponto jsonb;v jsonb;quantidade integer;
begin
 if jsonb_typeof(anel) is distinct from 'array' then raise exception 'Contorno geográfico inválido' using errcode='23514';end if;
 quantidade:=jsonb_array_length(anel);
 if quantidade<(case when fechado then 4 else 3 end) or quantidade>2001 then raise exception 'O contorno deve conter de 3 a 2.000 vértices' using errcode='23514';end if;
 for ponto in select value from jsonb_array_elements(anel) loop
  if jsonb_typeof(ponto) is distinct from 'array' then raise exception 'Coordenada geográfica inválida' using errcode='23514';end if;
  if jsonb_array_length(ponto) not in (2,3) then raise exception 'Informe longitude, latitude e altitude opcional' using errcode='23514';end if;
  for v in select value from jsonb_array_elements(ponto) loop
   if jsonb_typeof(v) is distinct from 'number' then raise exception 'Coordenadas devem ser numéricas' using errcode='23514';end if;
  end loop;
  if (ponto->>0)::numeric not between -180 and 180 or (ponto->>1)::numeric not between -90 and 90 then raise exception 'Coordenadas fora do intervalo de longitude/latitude' using errcode='23514';end if;
 end loop;
 if fechado and anel->0 is distinct from anel->(quantidade-1) then raise exception 'O contorno geográfico não está fechado' using errcode='23514';end if;
 if (select count(distinct value) from jsonb_array_elements(anel))<3 then raise exception 'Contorno sem três vértices distintos' using errcode='23514';end if;
 return quantidade;
end $$;

create or replace function integracao_projetos_privado.validar_geometria(g jsonb)
returns integer language plpgsql immutable set search_path='' as $$
declare poligonos jsonb;poligono jsonb;anel jsonb;total integer:=0;
begin
 if jsonb_typeof(g) is distinct from 'object' or g ? 'crs' or coalesce(g->>'type','') not in ('Polygon','MultiPolygon') then raise exception 'Use geometrias Polygon ou MultiPolygon em longitude/latitude' using errcode='23514';end if;
 poligonos:=case when g->>'type'='Polygon' then jsonb_build_array(g->'coordinates') else g->'coordinates' end;
 if jsonb_typeof(poligonos) is distinct from 'array' then raise exception 'Coordenadas do polígono inválidas' using errcode='23514';end if;
 if jsonb_array_length(poligonos) not between 1 and 2000 then raise exception 'Informe de 1 a 2.000 polígonos' using errcode='23514';end if;
 for poligono in select value from jsonb_array_elements(poligonos) loop
  if jsonb_typeof(poligono) is distinct from 'array' then raise exception 'Anéis do polígono inválidos' using errcode='23514';end if;
  if jsonb_array_length(poligono)<1 then raise exception 'Polígono sem contorno externo' using errcode='23514';end if;
  for anel in select value from jsonb_array_elements(poligono) loop
   total:=total+integracao_projetos_privado.validar_anel(anel,true)-1;
   if total>10000 then raise exception 'A geometria excede 10.000 vértices' using errcode='23514';end if;
  end loop;
 end loop;
 return total;
end $$;

create or replace function integracao_projetos_privado.validar_geografia(antes jsonb,depois jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare colecao jsonb;f jsonb;antiga jsonb;anel jsonb;total integer:=0;epsg text;
begin
 if antes#>'{geo,geojson}' is distinct from depois#>'{geo,geojson}' and coalesce(depois#>'{geo,geojson}','null')<>'null'::jsonb then
  colecao:=depois#>'{geo,geojson}';
  if octet_length(colecao::text)>10485760 or jsonb_typeof(colecao) is distinct from 'object' or colecao ? 'crs' or colecao->>'type' is distinct from 'FeatureCollection' or jsonb_typeof(colecao->'features') is distinct from 'array' then raise exception 'GeoJSON inválido: utilize uma coleção RFC 7946 de até 10 MB' using errcode='23514';end if;
  if jsonb_array_length(colecao->'features') not between 1 and 2000 then raise exception 'GeoJSON deve conter de 1 a 2.000 feições' using errcode='23514';end if;
  for f in select value from jsonb_array_elements(colecao->'features') loop
   if f->>'type' is distinct from 'Feature' or f ? 'crs' then raise exception 'Feição GeoJSON inválida' using errcode='23514';end if;
   total:=total+integracao_projetos_privado.validar_geometria(f->'geometry');
   if total>10000 then raise exception 'O GeoJSON excede 10.000 vértices' using errcode='23514';end if;
  end loop;
 end if;
 if antes#>'{geo,poligonos}' is distinct from depois#>'{geo,poligonos}' and coalesce(depois#>'{geo,poligonos}','null')<>'null'::jsonb then
  colecao:=depois#>'{geo,poligonos}';total:=0;
  if jsonb_typeof(colecao) is distinct from 'array' then raise exception 'Contornos do núcleo inválidos' using errcode='23514';end if;
  if jsonb_array_length(colecao)>2000 then raise exception 'O núcleo excede 2.000 polígonos' using errcode='23514';end if;
  for anel in select value from jsonb_array_elements(colecao) loop
   total:=total+integracao_projetos_privado.validar_anel(anel,false);
   if total>12000 then raise exception 'Os contornos excedem o limite de vértices' using errcode='23514';end if;
  end loop;
 end if;
 if antes->'levantamentoGeoJSON' is distinct from depois->'levantamentoGeoJSON' and coalesce(depois->'levantamentoGeoJSON','null')<>'null'::jsonb then
  colecao:=depois#>'{levantamentoGeoJSON,feicoes}';epsg:=depois#>>'{levantamentoGeoJSON,epsg}';total:=0;
  if jsonb_typeof(colecao) is distinct from 'array' then raise exception 'Feições do levantamento inválidas' using errcode='23514';end if;
  if jsonb_array_length(colecao)>2000 then raise exception 'O levantamento excede 2.000 feições' using errcode='23514';end if;
  for f in select value from jsonb_array_elements(colecao) loop
   select value into antiga from jsonb_array_elements(coalesce(antes#>'{levantamentoGeoJSON,feicoes}','[]')) where value->>'id'=f->>'id';
   if antiga is null or antiga->'geometria' is distinct from f->'geometria' or antiga->'poligono' is distinct from f->'poligono' or antes#>>'{levantamentoGeoJSON,epsg}' is distinct from epsg then
    if coalesce(epsg,'') not in ('4326','31978','31979','31980','31981','31982','31983','31984','31985') then raise exception 'Sistema de coordenadas do levantamento não suportado' using errcode='23514';end if;
    if epsg='4326' or f ? 'geometria' then total:=total+integracao_projetos_privado.validar_geometria(f->'geometria');end if;
    perform integracao_projetos_privado.validar_anel(f->'poligono',false);
    if total>10000 then raise exception 'O levantamento excede 10.000 vértices novos' using errcode='23514';end if;
   end if;
  end loop;
 end if;
end $$;
revoke all on function integracao_projetos_privado.validar_anel(jsonb,boolean),integracao_projetos_privado.validar_geometria(jsonb),integracao_projetos_privado.validar_geografia(jsonb,jsonb) from public,anon;
grant execute on function integracao_projetos_privado.validar_anel(jsonb,boolean),integracao_projetos_privado.validar_geometria(jsonb),integracao_projetos_privado.validar_geografia(jsonb,jsonb) to authenticated;

create or replace function integracao_projetos_privado.proteger_campos()
returns trigger language plpgsql set search_path='' as $$
declare antes jsonb;depois jsonb;u jsonb;anterior jsonb;campo text;recurso text;
begin
 -- Operações de manutenção sem sessão não ampliam permissões dos usuários internos.
 if auth.uid() is null and current_user in ('postgres','service_role') then return new;end if;
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo) then raise exception 'Sessão ativa obrigatória' using errcode='42501';end if;
 antes:=case when tg_op='INSERT' then '{}'::jsonb else old.dados end;
 depois:=new.dados;
 recurso:=case when tg_table_name='integracao_nucleos' then 'nucleos' when tg_table_name='integracao_moradores' then 'clientes'
   when new.colecao='nucleos' then 'nucleos' when new.colecao='processos' then 'clientes' else null end;
 if recurso is null then return new;end if;
 if recurso='nucleos' then
  if coalesce(antes->'geo','null') is distinct from coalesce(depois->'geo','null') and not integracao_projetos_privado.permite('mapa') then raise exception 'Sem permissão para alterar o perímetro do núcleo' using errcode='42501';end if;
  if coalesce(antes->'levantamentoGeoJSON','null') is distinct from coalesce(depois->'levantamentoGeoJSON','null') and not integracao_projetos_privado.permite('geometria') then raise exception 'Sem permissão para importar geometrias do núcleo' using errcode='42501';end if;
  if coalesce(antes->'memorial','null') is distinct from coalesce(depois->'memorial','null') and not integracao_projetos_privado.permite('memorial_nucleo') then raise exception 'Sem permissão para alterar o memorial do núcleo' using errcode='42501';end if;
  perform integracao_projetos_privado.validar_geografia(coalesce(antes,'{}'),depois);
 elsif coalesce(antes->'unidades','[]') is distinct from coalesce(depois->'unidades','[]') then
  if jsonb_typeof(depois->'unidades') is distinct from 'array' then raise exception 'Unidades inválidas';end if;
  for u in select value from jsonb_array_elements(depois->'unidades') loop
   select value into anterior from jsonb_array_elements(coalesce(antes->'unidades','[]')) where value->>'id'=u->>'id';
   if coalesce(anterior->>'area','') is distinct from coalesce(u->>'area','') and not integracao_projetos_privado.permite('area_unidade') then raise exception 'Sem permissão para alterar a área da unidade' using errcode='42501';end if;
   foreach campo in array array['lote','quadra','loteQuadra'] loop
    if coalesce(anterior->>campo,'') is distinct from coalesce(u->>campo,'') and not integracao_projetos_privado.permite('lote_quadra') then raise exception 'Sem permissão para alterar lote e quadra' using errcode='42501';end if;
   end loop;
   foreach campo in array array['memorial','vertices','perimetro','memorialHistorico','memorialRevogado'] loop
    if coalesce(anterior->campo,'null') is distinct from coalesce(u->campo,'null')
      and not (anterior->campo is null and (u->campo is null or u->campo='""'::jsonb or u->campo='[]'::jsonb))
      and not integracao_projetos_privado.permite('memorial_unidade') then raise exception 'Sem permissão para alterar o memorial técnico da unidade' using errcode='42501';end if;
   end loop;
  end loop;
 end if;
 -- RLS, contratos de atribuições, fluxo e aprovações permanecem nos controles existentes.
 return new;
end $$;
revoke all on function integracao_projetos_privado.proteger_campos() from public,anon,authenticated;
create trigger projetos_campos before insert or update of dados on public.integracao_nucleos for each row execute function integracao_projetos_privado.proteger_campos();
create trigger projetos_campos before insert or update of dados on public.integracao_moradores for each row execute function integracao_projetos_privado.proteger_campos();
create trigger projetos_campos before insert or update of dados on public.integracao_complementos for each row execute function integracao_projetos_privado.proteger_campos();

-- Consulta privilegiada apenas para detectar conflitos, inclusive fora do escopo visual.
-- Não retorna dados do cadastro conflitante. Escrita continua sujeita à RLS original.
create or replace function integracao_projetos_privado.proteger_codigo()
returns trigger language plpgsql security definer set search_path='' as $$
declare codigo_normalizado text:=upper(btrim(new.codigo));
begin
 if tg_op='UPDATE' and new.codigo is not distinct from old.codigo then return new;end if;
 if codigo_normalizado is null or codigo_normalizado='' then return new;end if;
 if codigo_normalizado !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$' then raise exception 'Use até 64 letras, números, hífens ou sublinhados no código' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('integracao-codigo:'||codigo_normalizado,0));
 if exists(select 1 from public.fin_receb_clientes c where c.id<>new.id and upper(btrim(c.codigo))=codigo_normalizado) then
  raise exception 'Este código já pertence a outro morador. Revise o código informado.' using errcode='23505';
 end if;
 return new;
end $$;
revoke all on function integracao_projetos_privado.proteger_codigo() from public,anon,authenticated;
create trigger projetos_codigo before insert or update of codigo on public.fin_receb_clientes for each row execute function integracao_projetos_privado.proteger_codigo();

-- Reservas de emissão não registram envio externo e nunca são recicladas.
create table public.integracao_oficios_reservas(
 pedido uuid primary key,
 usuario_id uuid not null references public.profiles(id),
 ano integer not null check(ano between 2000 and 2199),
 numero integer not null check(numero between 1 and 999999),
 criado_em timestamptz not null default clock_timestamp(),
 oficio_id uuid references public.integracao_oficios(id),
 unique(ano,numero)
);
alter table public.integracao_oficios_reservas enable row level security;
revoke all on public.integracao_oficios_reservas from public,anon,authenticated;
grant select on public.integracao_oficios_reservas to authenticated;
create policy ler_reservas on public.integracao_oficios_reservas for select to authenticated
using(exists(select 1 from public.profiles where id=auth.uid() and ativo)
 and (usuario_id=auth.uid() or integracao_crm_privado.pode_editar_oficios()));

create or replace function integracao_projetos_privado.reservar_oficio(p_pedido uuid,p_ano integer,p_inicial integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.integracao_oficios_reservas;ultimo integer;proximo integer;u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.profiles where id=u and ativo) then raise exception 'Sessão ativa obrigatória' using errcode='42501';end if;
 if p_pedido is null or p_ano is null or p_ano not between 2000 and 2199 then raise exception 'Informe um pedido e ano válidos';end if;
 perform pg_advisory_xact_lock(hashtextextended('oficio-reserva:'||p_pedido::text,0));
 select * into r from public.integracao_oficios_reservas where pedido=p_pedido;
 if found then
  if r.usuario_id<>u or r.ano<>p_ano then raise exception 'Pedido de reserva inválido' using errcode='42501';end if;
  return to_jsonb(r);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('oficios-ano:'||p_ano::text,0));
 select s.ultimo into ultimo from public.integracao_oficios_sequencias s where s.ano=p_ano;
 if ultimo is null then
  if p_inicial is null or p_inicial not between 1 and 999999 then raise exception 'Confirme o número inicial deste ano antes de emitir';end if;
  proximo:=p_inicial;
 else proximo:=ultimo+1;end if;
 if proximo>999999 then raise exception 'Limite anual de numeração alcançado';end if;
 if exists(select 1 from public.integracao_oficios where ano=p_ano and numero=proximo) then raise exception 'O número informado já está registrado. Confira a sequência';end if;
 insert into public.integracao_oficios_sequencias(ano,ultimo) values(p_ano,proximo)
 on conflict(ano) do update set ultimo=excluded.ultimo;
 insert into public.integracao_oficios_reservas(pedido,usuario_id,ano,numero) values(p_pedido,u,p_ano,proximo) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function integracao_projetos_privado.reservar_oficio(uuid,integer,integer) from public,anon;
grant execute on function integracao_projetos_privado.reservar_oficio(uuid,integer,integer) to authenticated;
create or replace function public.integracao_oficio_reservar_numero(p_pedido uuid,p_ano integer,p_inicial integer default null)
returns jsonb language sql set search_path='' as $$select integracao_projetos_privado.reservar_oficio(p_pedido,p_ano,p_inicial)$$;
revoke all on function public.integracao_oficio_reservar_numero(uuid,integer,integer) from public,anon;
grant execute on function public.integracao_oficio_reservar_numero(uuid,integer,integer) to authenticated;

-- Preserva o registro autorizado de envio; acrescenta apenas consumo da reserva.
CREATE OR REPLACE FUNCTION integracao_crm_privado.oficio_registrar_v1(p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();r public.integracao_oficios;ano_v integer;numero_v integer;ultimo_v integer;pedido uuid;dia date;caminho_v text;reserva_v public.integracao_oficios_reservas;
begin
 if u is null or not exists(select 1 from public.profiles where id=u and ativo) then raise exception 'Sessão ativa obrigatória';end if;
 if not integracao_crm_privado.pode_editar_oficios() then raise exception 'Sem permissão para cadastrar ofícios';end if;
 if p_acao='resumo' then
 update public.integracao_oficios set resumo=p_dados->>'resumo',resumo_status=p_dados->>'resumo_status',atualizado_em=clock_timestamp() where id=(p_dados->>'id')::uuid returning * into r;
 if not found then raise exception 'Ofício não encontrado';end if;return to_jsonb(r);
 elsif p_acao<>'registrar' then raise exception 'Ação inválida';end if;
 pedido:=(p_dados->>'pedido')::uuid;
 if pedido is null then raise exception 'Identificador obrigatório';end if;
 -- Idempotência por pedido, inclusive quando o retorno anterior não chegou ao aparelho.
 perform pg_advisory_xact_lock(hashtextextended('oficio-pedido:'||pedido::text,0));
 select * into r from public.integracao_oficios where id=pedido;
 if found then if r.autor<>u then raise exception 'Pedido inválido';end if;return to_jsonb(r);end if;
 dia:=(p_dados->>'data_envio')::date;ano_v:=extract(year from dia)::integer;
 if dia is null or ano_v not between 2000 and 2199 or dia>(clock_timestamp() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a data em que o ofício foi enviado';end if;
 caminho_v:=p_dados->>'caminho';
 if split_part(caminho_v,'/',1)<>u::text or split_part(caminho_v,'/',2)<>pedido::text or not exists(select 1 from storage.objects where bucket_id='integracao-oficios' and name=caminho_v) then raise exception 'Envie o arquivo antes de registrar o ofício';end if;
 if exists(select 1 from public.integracao_oficios where sha256=p_dados->>'sha256') then raise exception 'Este arquivo já está cadastrado no controle de ofícios';end if;
 perform pg_advisory_xact_lock(hashtextextended('oficios-ano:'||ano_v::text,0));
 select ultimo into ultimo_v from public.integracao_oficios_sequencias where ano=ano_v;
 numero_v:=(p_dados->>'numero')::integer;
 if nullif(p_dados->>'reserva','') is not null then
 select * into reserva_v from public.integracao_oficios_reservas rv where rv.pedido=(p_dados->>'reserva')::uuid for update;
 if not found or reserva_v.ano<>ano_v or reserva_v.numero<>numero_v or reserva_v.oficio_id is not null then raise exception 'Reserva de número indisponível ou incompatível';end if;
 elsif ultimo_v is null then
 if numero_v is null or numero_v not between 1 and 999999 then raise exception 'Confirme o número do primeiro ofício deste ano';end if;
 insert into public.integracao_oficios_sequencias values(ano_v,numero_v);
 else
 if numero_v is distinct from ultimo_v+1 then raise exception 'A sequência foi atualizada. Confira o próximo número antes de salvar';end if;
 update public.integracao_oficios_sequencias set ultimo=numero_v where ano=ano_v;
 end if;
 insert into public.integracao_oficios(id,ano,numero,prefeitura,assunto,data_envio,caminho,nome_arquivo,mime,tamanho,sha256,resumo,resumo_status,autor)
 values(pedido,ano_v,numero_v,p_dados->>'prefeitura',p_dados->>'assunto',dia,caminho_v,p_dados->>'nome_arquivo',p_dados->>'mime',(p_dados->>'tamanho')::integer,p_dados->>'sha256',coalesce(p_dados->>'resumo',''),coalesce(p_dados->>'resumo_status','pendente'),u) returning * into r;
 if reserva_v.pedido is not null then update public.integracao_oficios_reservas set oficio_id=r.id where integracao_oficios_reservas.pedido=reserva_v.pedido;end if;
 return to_jsonb(r);
end $function$;
revoke all on function integracao_crm_privado.oficio_registrar_v1(text,jsonb) from public,anon;
grant execute on function integracao_crm_privado.oficio_registrar_v1(text,jsonb) to authenticated;

notify pgrst,'reload schema';

commit;
