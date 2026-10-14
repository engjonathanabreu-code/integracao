-- Internal evaluators for the existing Topografia/Projeto contract only.
-- Other profiles keep their current policies and workflows.
create function integracao_atribuicoes_privado.texto(v jsonb) returns text language plpgsql immutable set search_path='' as $$
declare x jsonb;s text:='';primeiro boolean:=true;
begin
 if v is null or v='null'::jsonb then return '';end if;
 case jsonb_typeof(v)
 when 'string' then return v#>>'{}';
 when 'object' then return '[object Object]';
 when 'array' then
  for x in select value from jsonb_array_elements(v) loop
   if not primeiro then s:=s||',';end if;primeiro:=false;s:=s||integracao_atribuicoes_privado.texto(x);
  end loop;return s;
 else return v::text;end case;
end $$;
create function integracao_atribuicoes_privado.travar_fluxo(chave text) returns void language plpgsql set search_path='' as $$
declare normal text;
begin
 if coalesce(chave,'')='' then return;end if;
 select coalesce(referencia_id::text,registro_id) into normal from public.integracao_nucleos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;
 if normal is null then select coalesce(referencia_id::text,registro_id) into normal from public.integracao_complementos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('integracao-fluxo:'||coalesce(normal,chave),0)) then raise exception 'O fluxo deste nucleo mudou em outra sessao. Recarregue e tente novamente.' using errcode='PT409';end if;
end $$;
create function integracao_atribuicoes_privado.avaliar_nucleo(n jsonb,etapa integer,config jsonb,ativos integer,prontos integer) returns jsonb language plpgsql immutable set search_path='' as $$
declare base jsonb;nome text;chave text;campos jsonb:=coalesce(n->'campos','{}');
begin
 nome:=case etapa when 1 then 'topografia' when 2 then 'projeto' else null end;
 if nome is null then raise exception 'Etapa do nucleo fora do contrato setorial';end if;
 base:=jsonb_build_array(jsonb_build_object('id','moradores','tipo','auto','ok',ativos>0 and ativos=prontos));
 if etapa=2 then
  base:=base||jsonb_build_array(jsonb_build_object('id','artPrf','tipo','campo','ok',integracao_atribuicoes_privado.preenchido(campos->'artPrf')),
   jsonb_build_object('id','estudoAmbiental','tipo','escolha','ok',coalesce(campos->>'estudoAmbiental','') in ('sim','nao')),
   jsonb_build_object('id','estudoRisco','tipo','escolha','ok',coalesce(campos->>'estudoRisco','') in ('sim','nao')),
   jsonb_build_object('id','termos','tipo','manual','ok',integracao_atribuicoes_privado.verdadeiro(n#>'{checks,termos}')));
  if campos->>'estudoAmbiental'='sim' then base:=base||jsonb_build_array(jsonb_build_object('id','artAmbiental','tipo','campo','ok',integracao_atribuicoes_privado.preenchido(campos->'artAmbiental')));end if;
 end if;
 return integracao_atribuicoes_privado.avaliar_lista(base,n,coalesce(config->'ajustes'->('nucleo:'||nome),'{}'),coalesce((config->>'municipal')::boolean,false));
end $$;
create function integracao_atribuicoes_privado.normalizar_municipio(v text) returns text language sql immutable set search_path='' as $$select lower(trim(regexp_replace(normalize(coalesce(v,''),NFD),U&'[\0300-\036f]','','g')))$$;
create function integracao_atribuicoes_privado.validar_nucleo(antes jsonb,depois jsonb,chave text,referencia uuid,tipo_perfil text,operacao text) returns void language plpgsql security definer set search_path='' as $$
declare etapa integer:=coalesce((antes->>'etapa')::integer,0);nova integer:=coalesce((depois->>'etapa')::integer,0);nome text;config jsonb;ajuste jsonb;municipio text;municipio_nome text;municipio_uf text;municipios integer;chaves text[];campos text[];campo text;ativos integer;prontos integer;falhas jsonb;aliases text[];
begin
 if operacao='INSERT' and coalesce((depois->>'etapa')::integer,0)=0 and coalesce(depois->'checks','{}')='{}'::jsonb and coalesce(depois->'campos','{}')='{}'::jsonb then return;end if;
 if not ((etapa=1 and tipo_perfil='Topografia') or (etapa=2 and tipo_perfil='Projetos')) then raise exception 'Fluxo setorial do nucleo preservado' using errcode='42501';end if;
 if abs(nova-etapa)>1 then raise exception 'Nao e permitido pular etapas do nucleo' using errcode='42501';end if;
 perform integracao_atribuicoes_privado.travar_fluxo(coalesce(referencia::text,chave));
 if nova<etapa and (length(trim(coalesce(depois#>>'{reaberturaFluxo,motivo}','')))<3 or depois#>>'{reaberturaFluxo,de}' is distinct from etapa::text or depois#>>'{reaberturaFluxo,para}' is distinct from nova::text or antes->'reaberturaFluxo' is not distinct from depois->'reaberturaFluxo') then raise exception 'Retrocesso do nucleo exige motivo novo' using errcode='42501';end if;
 select k.municipio,coalesce(nullif(k.estado,''),'SC') into municipio_nome,municipio_uf from public.processos_kanban k where k.id=referencia or k.id::text=chave;
 if found then
  if nullif(trim(municipio_nome),'') is null then raise exception 'Municipio canonico do nucleo ausente' using errcode='PT409';end if;
  select count(*)::integer,min(m.id::text) into municipios,municipio from public.fin_receb_municipios m where integracao_atribuicoes_privado.normalizar_municipio(m.nome)=integracao_atribuicoes_privado.normalizar_municipio(municipio_nome) and coalesce(nullif(m.uf,''),'SC')=municipio_uf;
  if municipios>1 then raise exception 'Municipio canonico ambiguo' using errcode='PT409';end if;
  if municipios=0 then municipio:='municipio_'||integracao_atribuicoes_privado.normalizar_municipio(municipio_nome)||'_'||municipio_uf;end if;
 else municipio:=coalesce(antes->>'municipioId',depois->>'municipioId');end if;
 config:=integracao_atribuicoes_privado.config_fluxo(municipio);nome:=case etapa when 1 then 'topografia' else 'projeto' end;ajuste:=coalesce(config->'ajustes'->('nucleo:'||nome),'{}');
 chaves:=case etapa when 2 then array['termos'] else '{}'::text[] end;
 select coalesce(array_agg(x),'{}') into chaves from unnest(chaves) x where not coalesce(ajuste->'desativados','[]') ? x;
 select chaves||coalesce(array_agg(e->>'id'),'{}') into chaves from jsonb_array_elements(integracao_atribuicoes_privado.lista(ajuste->'extras')) e where coalesce(e->>'tipo','manual')<>'campo';
 campos:=case etapa when 2 then array['artPrf','estudoAmbiental','artAmbiental','estudoRisco'] else '{}'::text[] end;
 select campos||coalesce(array_agg(e->>'id'),'{}') into campos from jsonb_array_elements(integracao_atribuicoes_privado.lista(ajuste->'extras')) e where e->>'tipo'='campo';
 for campo in select jsonb_object_keys(coalesce(antes->'checks','{}')||coalesce(depois->'checks','{}')) loop
  if antes#>array['checks',campo] is distinct from depois#>array['checks',campo] and (not(campo=any(chaves)) or coalesce(jsonb_typeof(depois#>array['checks',campo]),'null') not in ('boolean','null')) then raise exception 'Requisito do nucleo automatico ou de outra etapa' using errcode='42501';end if;
 end loop;
 for campo in select jsonb_object_keys(coalesce(antes->'campos','{}')||coalesce(depois->'campos','{}')) loop
  if antes#>array['campos',campo] is distinct from depois#>array['campos',campo] and not(campo=any(campos)) then raise exception 'Campo do nucleo de outra etapa' using errcode='42501';end if;
 end loop;
 if nova>etapa then
  aliases:=array[chave,referencia::text];
  with candidatos as (select colecao,registro_id,dados,referencia_id,1 prioridade from public.integracao_moradores union all select colecao,registro_id,dados,referencia_id,2 from public.integracao_complementos),
  atuais as (select distinct on(colecao,registro_id) * from candidatos where colecao='processos' order by colecao,registro_id,prioridade),
  membros as (select e.dados from atuais e left join public.fin_receb_clientes c on c.id=e.referencia_id where e.dados->>'nucleoId'=any(aliases) and coalesce(c.ativo,true) and coalesce(e.dados->>'situacao','Ativo')='Ativo' and e.dados#>'{extras,arquivamento,ativo}' is distinct from 'true'::jsonb)
  select count(*)::integer,count(*) filter(where coalesce((dados->>'etapa')::integer,0)>=case etapa when 1 then 4 else 5 end)::integer into ativos,prontos from membros;
  falhas:=integracao_atribuicoes_privado.avaliar_nucleo(depois,etapa,config,ativos,prontos);
  if jsonb_array_length(falhas)>0 then raise exception 'Requisitos do nucleo ainda pendentes. Atualize os dados.' using errcode='PT409',detail=falhas::text;end if;
 end if;
end $$;
create function integracao_atribuicoes_privado.preenchido(v jsonb) returns boolean language sql immutable set search_path='' as $$select nullif(trim(integracao_atribuicoes_privado.texto(v)),'') is not null$$;
create function integracao_atribuicoes_privado.verdadeiro(v jsonb) returns boolean language sql immutable set search_path='' as $$select case when v is null or v='null'::jsonb or v='false'::jsonb or v='0'::jsonb or v='""'::jsonb then false else true end$$;
create function integracao_atribuicoes_privado.lista(v jsonb) returns jsonb language sql immutable set search_path='' as $$select case when jsonb_typeof(v)='array' then v else '[]'::jsonb end$$;
create function integracao_atribuicoes_privado.numero(v jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare s text:=trim(integracao_atribuicoes_privado.texto(v));n numeric;
begin
 if s='' then return null;end if;
 if position(',' in s)>0 then s:=replace(replace(s,'.',''),',','.');end if;
 begin n:=s::numeric;exception when others then return null;end;
 if n::text in ('NaN','Infinity','-Infinity') then return null;end if;return n;
end $$;
create function integracao_atribuicoes_privado.campo_preenchido(def jsonb,v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare linha jsonb;sub jsonb;
begin
 if def->>'tipo'='grupo' then
  if integracao_atribuicoes_privado.verdadeiro(def->'repetir') then
   if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then return false;end if;
   for linha in select value from jsonb_array_elements(v) loop
    for sub in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(def->'subcampos')) loop
     if not integracao_atribuicoes_privado.preenchido(linha->(sub->>'id')) then return false;end if;
    end loop;
   end loop;
  else
   for sub in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(def->'subcampos')) loop
    if not integracao_atribuicoes_privado.preenchido(v->(sub->>'id')) then return false;end if;
   end loop;
  end if;return true;
 end if;return integracao_atribuicoes_privado.preenchido(v);
end $$;
create function integracao_atribuicoes_privado.config_valor(chave text) returns jsonb language plpgsql security definer set search_path='' as $$
declare atual jsonb;legado jsonb;
begin
 select dados->'valor' into atual from public.integracao_configuracoes where colecao='config' and registro_id=chave;
 if found then return atual;end if;
 select dados->'valor' into legado from public.integracao_complementos where colecao='config' and registro_id=chave;
 return legado;
end $$;
create function integracao_atribuicoes_privado.config_fluxo(municipio text) returns jsonb language plpgsql security definer set search_path='' as $$
declare local_config jsonb;padrao jsonb:=integracao_atribuicoes_privado.padroes_fluxo();ajustes jsonb;municipal boolean;
begin
 local_config:=integracao_atribuicoes_privado.config_valor('ajustesMunicipio')->municipio;
 municipal:=nullif(local_config->'ajustesRequisitos','null'::jsonb) is not null;
 ajustes:=coalesce(nullif(local_config->'ajustesRequisitos','null'::jsonb),integracao_atribuicoes_privado.config_valor('ajustesRequisitos'),'{}');
 return jsonb_build_object('ajustes',ajustes,'municipal',municipal,
 'campos',coalesce(nullif(local_config->'campos','null'::jsonb),integracao_atribuicoes_privado.config_valor('campos'),padrao->'campos'),
 'checklist',coalesce(nullif(local_config->'checklistCampo','null'::jsonb),integracao_atribuicoes_privado.config_valor('checklistCampo'),padrao->'checklist'));
end $$;
create function integracao_atribuicoes_privado.nucleo_fluxo(chave text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;referencia uuid;k public.processos_kanban;
begin
 if coalesce(chave,'')='' then return null;end if;
 select dados,referencia_id into d,referencia from public.integracao_nucleos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;
 if d is null then
  select dados,referencia_id into d,referencia from public.integracao_complementos where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc limit 1;
 end if;
 select * into k from public.processos_kanban where id::text=chave or id=referencia limit 1;
 if d is null and k.id is null then return null;end if;
 if coalesce(k.excluido_erp,false) or d#>'{extras,arquivamento,ativo}'='true'::jsonb then return null;end if;
 return coalesce(d,'{}')||jsonb_build_object('id',chave,'etapa',coalesce(d->'etapa','0'::jsonb));
end $$;
create function integracao_atribuicoes_privado.avaliar_lista(base jsonb,p jsonb,ajuste jsonb,municipal boolean) returns jsonb language plpgsql immutable set search_path='' as $$
declare req jsonb;chave text;fixo boolean;ok boolean;tipo text;falhas jsonb:='[]';
begin
 for req in select value from jsonb_array_elements(base) loop
  chave:=req->>'id';fixo:=coalesce((req->>'fixo')::boolean,false) and not municipal;
  if not fixo and coalesce(ajuste->'desativados','[]') ? chave then continue;end if;
  ok:=coalesce((req->>'ok')::boolean,false);tipo:=req->>'tipo';
  if not fixo and coalesce(ajuste->'opcionais','[]') ? chave then ok:=true;if tipo<>'auto' then tipo:='marcador';end if;end if;
  if tipo='marcador' and coalesce(ajuste->'obrigatorios','[]') ? chave then ok:=integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave);end if;
  if not ok then falhas:=falhas||jsonb_build_array(chave);end if;
 end loop;
 for req in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(ajuste->'extras')) loop
  chave:=req->>'id';ok:=case when req->>'tipo'='campo' then integracao_atribuicoes_privado.preenchido(p->'campos'->chave) when integracao_atribuicoes_privado.verdadeiro(req->'opcional') then true else integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave) end;
  if not ok then falhas:=falhas||jsonb_build_array(chave);end if;
 end loop;return falhas;
end $$;
create function integracao_atribuicoes_privado.avaliar_fluxo(p jsonb,etapa integer,config jsonb,nucleo jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare base jsonb:='[]';falhas jsonb:='[]';req jsonb;def jsonb;item jsonb;linha jsonb;unidades jsonb;ajuste jsonb;nome text;chave text;lado text;valor jsonb;ok boolean;fixo boolean;opcional boolean;tipo text;confrontantes boolean:=true;info_campo boolean:=true;area boolean:=true;memorial boolean:=true;lote boolean:=true;
begin
 nome:=case etapa when 3 then 'topografia' when 4 then 'projeto' else null end;
 if nome is null then raise exception 'Etapa fora do contrato setorial';end if;
 ajuste:=coalesce(config->'ajustes'->nome,'{}');
 unidades:=integracao_atribuicoes_privado.lista(p->'unidades');
 if jsonb_array_length(unidades)=0 then unidades:=jsonb_build_array(jsonb_build_object('area','','memorial','','loteQuadra',p#>'{campos,loteQuadra}'));end if;
 for item in select value from jsonb_array_elements(unidades) loop
  area:=area and coalesce(integracao_atribuicoes_privado.numero(item->'area')>0,false);
  valor:=to_jsonb(trim(integracao_atribuicoes_privado.texto(item->'memorial')));
  memorial:=memorial and char_length(valor#>>'{}')+char_length(regexp_replace(valor#>>'{}',U&'[^\+010000-\+10FFFF]','','g'))>=40;
  lote:=lote and integracao_atribuicoes_privado.preenchido(item->'loteQuadra');
 end loop;
 if etapa=3 then
  for chave,lado in select * from (values ('2be328c2-7ccd-4448-a942-cfc6f62631fc','frente'),('bbb40008-d693-4be1-8021-613da327e8ce','fundo'),('d7d5ae44-f5af-4970-9d21-081840964ece','direito'),('0ca10151-b790-409b-a056-c9f8a963f3dc','esquerdo')) c loop
   valor:=case when coalesce(p->'extras','{}') ? chave then p->'extras'->chave else p#>array['campo','confrontantes',lado] end;
   confrontantes:=confrontantes and integracao_atribuicoes_privado.preenchido(valor);
  end loop;
  for item in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(config->'checklist')) loop
   if integracao_atribuicoes_privado.verdadeiro(item->'ativo') and integracao_atribuicoes_privado.verdadeiro(item->'obrigatorio') then
    valor:=p#>array['campo','respostas',item->>'id'];
    ok:=case item->>'tipo' when 'check' then valor='true'::jsonb when 'simnao' then valor in ('"sim"'::jsonb,'"nao"'::jsonb) else integracao_atribuicoes_privado.preenchido(valor) end;
    info_campo:=info_campo and coalesce(ok,false);
   end if;
  end loop;
  base:=jsonb_build_array(jsonb_build_object('id','confrontantes','tipo','auto','fixo',true,'ok',confrontantes),
   jsonb_build_object('id','nucleo','tipo','auto','ok',nucleo is not null),
   jsonb_build_object('id','foto_fachada','tipo','auto','ok',exists(select 1 from jsonb_array_elements(integracao_atribuicoes_privado.lista(p#>'{campo,fotos}')) f where f->>'tipo'='fachada')),
   jsonb_build_object('id','info_campo','tipo','auto','ok',info_campo),jsonb_build_object('id','area','tipo','auto','ok',area),jsonb_build_object('id','memorial','tipo','auto','ok',memorial));
  foreach chave in array array['medicao','lepac','conferencia'] loop base:=base||jsonb_build_array(jsonb_build_object('id',chave,'tipo','manual','ok',integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave)));end loop;
 else
  base:=jsonb_build_array(jsonb_build_object('id','loteQuadra','tipo','auto','ok',lote),
   jsonb_build_object('id','termo_gerado','tipo','auto','ok',exists(select 1 from jsonb_array_elements(integracao_atribuicoes_privado.lista(p->'documentosGerados')) g where g->>'tipo'='termo_compromisso')));
  foreach chave in array array['confrontacoes','termoAssinado'] loop base:=base||jsonb_build_array(jsonb_build_object('id',chave,'tipo','manual','ok',integracao_atribuicoes_privado.verdadeiro(p->'checks'->chave)));end loop;
 end if;
 for def in select value from jsonb_array_elements(integracao_atribuicoes_privado.lista(config#>'{campos,lista}')) loop
  if integracao_atribuicoes_privado.verdadeiro(def->'ativo') and def->>'obrigatorioEtapa'=nome and def->>'id' not in ('cp_familia','2be328c2-7ccd-4448-a942-cfc6f62631fc','bbb40008-d693-4be1-8021-613da327e8ce','d7d5ae44-f5af-4970-9d21-081840964ece','0ca10151-b790-409b-a056-c9f8a963f3dc') then
   base:=base||jsonb_build_array(jsonb_build_object('id','extra_'||(def->>'id'),'tipo','auto','ok',integracao_atribuicoes_privado.campo_preenchido(def,p->'extras'->(def->>'id'))));
  end if;
 end loop;
 return integracao_atribuicoes_privado.avaliar_lista(base,p,ajuste,coalesce((config->>'municipal')::boolean,false));
end $$;
create function integracao_atribuicoes_privado.validar_avanco(p jsonb,etapa integer,municipio text,ativo boolean) returns void language plpgsql security definer set search_path='' as $$
declare nucleo jsonb;config jsonb;falhas jsonb;grupo integer:=case etapa when 3 then 1 when 4 then 2 else -1 end;
begin
 if not coalesce(ativo,false) or coalesce(p->>'situacao','Ativo')<>'Ativo' then raise exception 'Morador inativo nao avanca' using errcode='42501';end if;
 nucleo:=integracao_atribuicoes_privado.nucleo_fluxo(p->>'nucleoId');
 if nucleo is null or coalesce((nucleo->>'etapa')::integer,0)<grupo then raise exception 'Aguardando conclusao da etapa do nucleo' using errcode='PT409';end if;
 config:=integracao_atribuicoes_privado.config_fluxo(municipio);
 falhas:=integracao_atribuicoes_privado.avaliar_fluxo(p,etapa,config,nucleo);
 if jsonb_array_length(falhas)>0 then raise exception 'Requisitos da etapa ainda pendentes. Atualize o cadastro.' using errcode='PT409',detail=falhas::text;end if;
end $$;
