-- Snapshot das funções de produção em 30/09/2026, somente para testes.
alter table public.integracao_ponto_jornadas alter column entrada drop not null, alter column saida drop not null, alter column intervalo drop not null;
alter table public.integracao_ponto_jornadas add column flexivel boolean not null default false, add column cargas integer[];
alter table public.integracao_ponto_jornadas add constraint jornada_modalidade check(case when flexivel then vinculo='CLT' and cargas is not null and cardinality(cargas)=7 else entrada is not null and saida is not null and intervalo is not null end);
CREATE OR REPLACE FUNCTION integracao_crm_privado.ponto_dia(p_usuario uuid, p_dia date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare j public.integracao_ponto_jornadas; b timestamptz[]; originais jsonb; revisao public.integracao_ponto_revisoes;
 inicio timestamptz; fim timestamptz; previsto integer:=0; trabalhado numeric:=0; dentro numeric:=0; regular integer:=0; extra integer:=0; aprovado integer:=0; rejeitado integer:=0; ajuste integer:=0;
 tolerancia numeric:=0; tolerancia_abonada integer:=0; v_assinatura text; decisao public.integracao_ponto_decisoes; i integer; pendente boolean; fechado boolean; flex boolean; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not (auth.uid()=p_usuario or integracao_crm_privado.permite('admin')) then raise exception 'Sem permissão';end if;
 select * into j from public.integracao_ponto_jornadas where usuario_id=p_usuario and vigencia<=p_dia order by vigencia desc,criado_em desc limit 1;
 flex:=coalesce(j.flexivel,false);
 if not flex then inicio:=(p_dia+j.entrada) at time zone 'America/Sao_Paulo';fim:=(p_dia+j.saida) at time zone 'America/Sao_Paulo';end if;
 if j.vinculo='CLT' and extract(dow from p_dia)::integer=any(j.dias) then
  if flex then previsto:=greatest(0,coalesce(j.cargas[extract(dow from p_dia)::integer+1],0));
  else previsto:=extract(epoch from(fim-inicio))/60-j.intervalo;end if;
 end if;
 select coalesce(array_agg(ocorrido_em order by ocorrido_em),'{}'),coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'hora',ocorrido_em,'origem',origem,'recebido_em',recebido_em) order by ocorrido_em),'[]') into b,originais
 from public.integracao_ponto_batidas where usuario_id=p_usuario and ocorrido_em>=p_dia::timestamp at time zone 'America/Sao_Paulo' and ocorrido_em<(p_dia+1)::timestamp at time zone 'America/Sao_Paulo';
 select * into revisao from public.integracao_ponto_revisoes where usuario_id=p_usuario and dia=p_dia order by criado_em desc limit 1;
 if found then b:=revisao.batidas;end if;
 pendente:=cardinality(b)%2=1;
 if cardinality(b)>=2 then for i in 1..cardinality(b)-1 by 2 loop
 trabalhado:=trabalhado+extract(epoch from(b[i+1]-b[i]))/60;
 if previsto>0 and not flex then dentro:=dentro+greatest(0,extract(epoch from(least(b[i+1],fim)-greatest(b[i],inicio)))/60);end if;
 end loop;end if;
 trabalhado:=floor(trabalhado);
 -- Flexível não tem janela: todo tempo trabalhado conta, até o limite da carga do dia.
 if flex then regular:=least(trabalhado::integer,previsto);else regular:=least(floor(dentro),previsto);end if;
 extra:=trabalhado-regular;
 if flex then fechado:=p_dia<hoje or (p_dia=hoje and not pendente and cardinality(b)>0 and trabalhado>=previsto);
 else fechado:=p_dia<hoje or (p_dia=hoje and not pendente and cardinality(b)>0 and now()>=coalesce(fim,now()));end if;

 -- Fixed schedules only, from the effective date, with complete closed punches.
 if p_dia>=date '2026-09-29' and previsto>0 and fechado and not pendente and cardinality(b)>=2
    and not coalesce((to_jsonb(j)->>'flexivel')::boolean,false) then
  if b[1]>inicio and b[1]<=inicio+interval '5 minutes' then
   tolerancia:=extract(epoch from(b[1]-inicio))/60;
  end if;
  if b[cardinality(b)]<fim and b[cardinality(b)]>=fim-interval '5 minutes' then
   tolerancia:=tolerancia+extract(epoch from(fim-b[cardinality(b)]))/60;
  end if;
  tolerancia_abonada:=greatest(0,least(previsto,floor(dentro+tolerancia)::integer)-regular);
 end if;
 v_assinatura:=md5(coalesce(j.id::text,'')||b::text);
 select * into decisao from public.integracao_ponto_decisoes where usuario_id=p_usuario and dia=p_dia and integracao_ponto_decisoes.assinatura=v_assinatura order by criado_em desc limit 1;
 if found then if decisao.aprovada then aprovado:=extra;else rejeitado:=extra;end if;end if;
 select coalesce(sum(minutos),0) into ajuste from public.integracao_ponto_ajustes where usuario_id=p_usuario and dia=p_dia;
 return jsonb_build_object('dia',p_dia,'vinculo',j.vinculo,'flexivel',flex,'previsto',previsto,'trabalhado',trabalhado,'extra',extra,'aprovado',aprovado,'rejeitado',rejeitado,'pendente_extra',greatest(0,extra-aprovado-rejeitado),
 'incompleto',pendente,'fechado',fechado,'assinatura',v_assinatura,'batidas',b,'originais',originais,'revisao',to_jsonb(revisao),'ajuste',ajuste,
 'tolerancia_abonada',tolerancia_abonada,'saldo',case when fechado and not pendente then regular+tolerancia_abonada-previsto+aprovado else 0 end+ajuste);
end $function$
;
CREATE OR REPLACE FUNCTION integracao_crm_privado.ponto_operar(p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); alvo uuid; hoje date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
 j public.integracao_ponto_jornadas; ultima public.integracao_ponto_batidas; recibo public.integracao_ponto_batidas;
 instante timestamptz; qtd integer; novo_id uuid; dia date; b timestamptz[]; i integer; resumo jsonb; inicio date; fim date; primeira date; linhas jsonb; saldo_anterior integer;
 v_flex boolean; v_dias integer[]; v_cargas integer[];
begin
 if u is null or not exists(select 1 from public.profiles where id=u and ativo) then raise exception 'Sessão ativa obrigatória';end if;
 alvo:=coalesce(nullif(p_dados->>'usuario_id','')::uuid,u);
 if alvo<>u and not integracao_crm_privado.permite('admin') then raise exception 'Sem permissão';end if;
 if p_acao in ('jornada','decidir','revisar','ajustar') and not integracao_crm_privado.permite('admin') then raise exception 'Somente administradores podem realizar esta ação';end if;
 perform pg_advisory_xact_lock(hashtextextended('ponto:'||alvo::text,0));
 if p_acao='jornada' then
 dia:=(p_dados->>'vigencia')::date;
 if dia is null or dia<hoje then raise exception 'A vigência deve ser hoje ou uma data futura';end if;
 if exists(select 1 from public.integracao_ponto_batidas where usuario_id=alvo and (ocorrido_em at time zone 'America/Sao_Paulo')::date>=dia) then raise exception 'Há batidas nessa vigência. Configure a nova jornada a partir de amanhã';end if;
 v_flex:=coalesce((p_dados->>'flexivel')::boolean,false);
 v_dias:=array(select jsonb_array_elements_text(p_dados->'dias')::integer);
 if cardinality(v_dias) is null or cardinality(v_dias)=0 then raise exception 'Selecione ao menos um dia da semana';end if;
 foreach i in array v_dias loop if i<0 or i>6 then raise exception 'Dia da semana inválido';end if;end loop;
 if v_flex then
  if p_dados->>'vinculo' is distinct from 'CLT' then raise exception 'O horário flexível é exclusivo do vínculo CLT';end if;
  v_cargas:=array(select jsonb_array_elements_text(p_dados->'cargas')::integer);
  if cardinality(v_cargas) is distinct from 7 then raise exception 'Informe a carga diária dos sete dias da semana';end if;
  foreach i in array v_cargas loop if i<0 or i>1440 then raise exception 'Cada carga diária deve ficar entre 0 e 24 horas';end if;end loop;
  foreach i in array v_dias loop if coalesce(v_cargas[i+1],0)<=0 then raise exception 'Informe uma carga diária maior que zero para cada dia marcado';end if;end loop;
 end if;
 insert into public.integracao_ponto_jornadas(usuario_id,vigencia,vinculo,dias,entrada,saida,intervalo,flexivel,cargas,autor)
 values(alvo,dia,p_dados->>'vinculo',v_dias,
  case when v_flex then null else (p_dados->>'entrada')::time end,
  case when v_flex then null else (p_dados->>'saida')::time end,
  case when v_flex then null else (p_dados->>'intervalo')::integer end,
  v_flex,case when v_flex then v_cargas else null end,u);
 return jsonb_build_object('ok',true);
 elsif p_acao='estado' then
 select * into j from public.integracao_ponto_jornadas where usuario_id=alvo and vigencia<=hoje order by vigencia desc,criado_em desc limit 1;
 select count(*) into qtd from public.integracao_ponto_batidas where usuario_id=alvo and (ocorrido_em at time zone 'America/Sao_Paulo')::date=hoje;
 return jsonb_build_object('jornada',to_jsonb(j),'proximo',case when qtd%2=0 then 'entrada' else 'saida' end,'hoje',integracao_crm_privado.ponto_dia(alvo,hoje),'agora',clock_timestamp());
 elsif p_acao in ('bater','bater_offline') then
 if alvo<>u then raise exception 'O ponto só pode ser registrado na própria conta';end if;
 novo_id:=(p_dados->>'pedido')::uuid;
 select * into recibo from public.integracao_ponto_batidas where id=novo_id;
 if found then if recibo.usuario_id<>u then raise exception 'Pedido inválido';end if;return to_jsonb(recibo);end if;
 instante:=clock_timestamp();
 if p_acao='bater_offline' then
 instante:=(p_dados->>'ocorrido_em')::timestamptz;
 if instante is null or not isfinite(instante) or instante>clock_timestamp()+interval '2 minutes' then raise exception 'Horário inválido. Confira o relógio do aparelho e solicite regularização';end if;
 hoje:=(instante at time zone 'America/Sao_Paulo')::date;
 if exists(select 1 from public.integracao_ponto_revisoes where usuario_id=u and integracao_ponto_revisoes.dia=hoje) then raise exception 'Este dia já foi regularizado. A administração precisa conferir esta marcação pendente';end if;
 end if;
 select * into j from public.integracao_ponto_jornadas where usuario_id=u and vigencia<=hoje order by vigencia desc,criado_em desc limit 1;
 if j.vinculo is distinct from 'CLT' then raise exception 'Ponto disponível somente para vínculo CLT vigente';end if;
 select * into ultima from public.integracao_ponto_batidas where usuario_id=u and (ocorrido_em at time zone 'America/Sao_Paulo')::date=hoje order by ocorrido_em desc limit 1;
 if ultima.ocorrido_em>=instante then raise exception 'Conflito com outra marcação neste dia. Solicite conferência à administração';end if;
 if ultima.ocorrido_em>instante-interval '30 seconds' then raise exception 'A última batida acabou de ser registrada. Aguarde 30 segundos';end if;
 select count(*) into qtd from public.integracao_ponto_batidas where usuario_id=u and (ocorrido_em at time zone 'America/Sao_Paulo')::date=hoje;
 if p_dados->>'tipo' is distinct from (case when qtd%2=0 then 'entrada' else 'saida' end) then raise exception 'Outra batida foi registrada. Atualize a tela';end if;
 insert into public.integracao_ponto_batidas(id,usuario_id,ocorrido_em,tipo,origem) values(novo_id,u,instante,p_dados->>'tipo',case when p_acao='bater' then 'servidor' when coalesce((p_dados->>'offline')::boolean,false) then 'offline' else 'aparelho' end) returning * into recibo;
 return to_jsonb(recibo);
 elsif p_acao='revisar' then
 dia:=(p_dados->>'dia')::date;
 if dia>=hoje or dia is null then raise exception 'Regularize apenas dias anteriores a hoje';end if;
 b:=array(select jsonb_array_elements_text(p_dados->'batidas')::timestamptz);
 if cardinality(b)%2<>0 or cardinality(b)>40 then raise exception 'Informe pares de entrada e saída';end if;
 for i in 1..cardinality(b) loop
 if (b[i] at time zone 'America/Sao_Paulo')::date<>dia or (i>1 and b[i]<=b[i-1]) then raise exception 'Batidas devem estar em ordem e dentro do dia';end if;
 end loop;
 insert into public.integracao_ponto_revisoes(usuario_id,dia,batidas,motivo,autor) values(alvo,dia,b,p_dados->>'motivo',u);
 return jsonb_build_object('ok',true);
 elsif p_acao='decidir' then
 dia:=(p_dados->>'dia')::date;resumo:=integracao_crm_privado.ponto_dia(alvo,dia);
 if (resumo->>'incompleto')::boolean or not (resumo->>'fechado')::boolean or (resumo->>'extra')::integer<=0 then raise exception 'Dia incompleto, ainda em andamento ou sem hora extra';end if;
 if resumo->>'assinatura' is distinct from p_dados->>'assinatura' then raise exception 'As batidas mudaram. Atualize o relatório antes de decidir';end if;
 insert into public.integracao_ponto_decisoes(usuario_id,dia,assinatura,minutos,aprovada,motivo,autor) values(alvo,dia,resumo->>'assinatura',(resumo->>'extra')::integer,(p_dados->>'aprovada')::boolean,p_dados->>'motivo',u);
 return jsonb_build_object('ok',true);
 elsif p_acao='ajustar' then
 dia:=(p_dados->>'dia')::date;if dia>hoje or dia is null then raise exception 'Ajuste somente até a data de hoje';end if;
 insert into public.integracao_ponto_ajustes(usuario_id,dia,minutos,motivo,autor) values(alvo,dia,(p_dados->>'minutos')::integer,p_dados->>'motivo',u);
 return jsonb_build_object('ok',true);
 elsif p_acao='relatorio' then
 inicio:=date_trunc('month',(p_dados->>'mes')::date)::date;fim:=least((inicio+interval '1 month - 1 day')::date,hoje);
 if inicio is null or inicio>hoje then raise exception 'Selecione o mês atual ou anterior';end if;
 select min(vigencia) into primeira from public.integracao_ponto_jornadas where usuario_id=alvo;
 select least(coalesce(primeira,hoje),coalesce(min(integracao_ponto_ajustes.dia),hoje)) into primeira from public.integracao_ponto_ajustes where usuario_id=alvo;
 if inicio<hoje-interval '10 years' or primeira<hoje-interval '10 years' then raise exception 'Período superior a dez anos requer fechamento administrativo';end if;
 select coalesce(jsonb_agg(integracao_crm_privado.ponto_dia(alvo,d::date) order by d),'[]') into linhas from generate_series(greatest(inicio,coalesce(primeira,inicio))::timestamp,fim::timestamp,interval '1 day') d;
 select coalesce(sum((integracao_crm_privado.ponto_dia(alvo,d::date)->>'saldo')::integer),0) into saldo_anterior from generate_series(primeira::timestamp,(inicio-1)::timestamp,interval '1 day') d;
 return jsonb_build_object('dias',linhas,'saldo_anterior',saldo_anterior,'fuso','America/Sao_Paulo');
 else raise exception 'Ação inválida';end if;
end $function$
;

