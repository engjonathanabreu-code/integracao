-- Evolução aditiva. Validar backup recuperável antes de aplicar em produção.
-- Não copia/altera moradores, núcleos, modelos legados ou documentos anteriores.
-- Todas as leituras e escritas são SECURITY INVOKER e conservam RLS da origem.
begin;
create schema if not exists integracao_documentos_privado;
revoke all on schema integracao_documentos_privado from public,anon;
grant usage on schema integracao_documentos_privado to authenticated;

create function integracao_documentos_privado.normalizar(v text) returns text language sql immutable set search_path='' as $$
 select lower(trim(regexp_replace(normalize(coalesce(v,''),NFD),U&'[\0300-\036f]','','g')))
$$;

create function integracao_documentos_privado.ativo() returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and ativo is true)
$$;
create function integracao_documentos_privado.gerir_modelos() returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and ativo is true and (integracao_documentos_privado.normalizar(tipo)='administrador' or integracao_documentos_privado.normalizar(tipo) like 'diretor %'))
$$;
create function integracao_documentos_privado.emitir_termos() returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and ativo is true and (integracao_documentos_privado.normalizar(tipo)='administrador' or integracao_documentos_privado.normalizar(tipo) like 'diretor %' or integracao_documentos_privado.normalizar(tipo) in ('projeto','projetos','comercial','atendimentos','topografia','juridico','pos-protocolo','posprotocolo') or integracao_documentos_privado.normalizar(setor) in ('projeto','projetos','comercial','atendimentos','topografia','juridico','pos-protocolo','posprotocolo')))
$$;

-- Mescla a identidade canônica sem gravar uma segunda base de moradores.
create function integracao_documentos_privado.morador(chave text) returns jsonb language plpgsql stable set search_path='' as $$
declare e record;c public.fin_receb_clientes;p jsonb;req jsonb;cliente uuid;aliases integer;
begin
 if not integracao_documentos_privado.ativo() then raise exception 'Perfil ativo necessário' using errcode='42501';end if;
 select * into e from (
  select colecao,registro_id,dados,referencia_tabela,referencia_id,criado_por,1 prioridade from public.integracao_moradores
  union all select colecao,registro_id,dados,referencia_tabela,referencia_id,criado_por,2 from public.integracao_complementos
 ) x where colecao='processos' and registro_id=chave order by prioridade limit 1;
 if not found then
  select * into c from public.fin_receb_clientes where id::text=chave;
  if not found then raise exception 'Morador não encontrado ou sem acesso' using errcode='42501';end if;
  cliente:=c.id;
 else
  if not public.integracao_acesso(e.referencia_tabela,e.referencia_id,e.criado_por) then raise exception 'Morador não encontrado ou sem acesso' using errcode='42501';end if;
  if e.referencia_tabela='fin_receb_clientes' then cliente:=e.referencia_id;end if;
 end if;
 if cliente is not null then
  select count(distinct registro_id)::integer into aliases from (
   select registro_id from public.integracao_moradores where colecao='processos' and referencia_tabela='fin_receb_clientes' and referencia_id=cliente
   union all
   select legado.registro_id from public.integracao_complementos legado where legado.colecao='processos' and legado.referencia_tabela='fin_receb_clientes' and legado.referencia_id=cliente and not exists(select 1 from public.integracao_moradores atual where atual.colecao='processos' and atual.registro_id=legado.registro_id)
  ) vinculados;
  if aliases>1 then raise exception 'Há mais de um cadastro vinculado à mesma identidade. Solicite a conferência dos vínculos.' using errcode='PT409';end if;
  if e.registro_id is null and aliases>0 then raise exception 'Abra o cadastro vinculado para consultar seus documentos' using errcode='PT409';end if;
 end if;
 if e.registro_id is null then
  return jsonb_build_object('id',c.id,'financeiroRef',c.id,'municipioId',c.municipio_id,'remessaId',c.remessa_id,'codigo',c.codigo,'requerente',jsonb_build_object('nome',c.nome,'cpf',coalesce(c.cpf_cnpj,'')),'conjuge','{}'::jsonb,'endereco','{}'::jsonb,'situacao',case when c.ativo then 'Ativo' else 'Inativo' end);
 end if;
 p:=e.dados||jsonb_build_object('id',e.registro_id);
 if e.referencia_tabela='fin_receb_clientes' then
  select * into c from public.fin_receb_clientes where id=e.referencia_id;
  if not found then raise exception 'Morador não encontrado ou sem acesso' using errcode='42501';end if;
  req:=coalesce(p->'requerente','{}')||jsonb_build_object('nome',c.nome,'cpf',case when p#>>'{requerente,tipoPessoa}'='juridica' then '' else coalesce(c.cpf_cnpj,'') end);
  if p#>>'{requerente,tipoPessoa}'='juridica' then req:=req||jsonb_build_object('cnpj',coalesce(c.cpf_cnpj,''));end if;
  p:=p||jsonb_build_object('financeiroRef',c.id,'municipioId',c.municipio_id,'remessaId',c.remessa_id,'codigo',c.codigo,'requerente',req,'situacao',case when c.ativo then case when coalesce(p->>'situacao','Ativo')='Ativo' then coalesce(p->>'situacao','Ativo') else 'Ativo' end else case when coalesce(p->>'situacao','')<>'Ativo' then coalesce(nullif(p->>'situacao',''),'Inativo') else 'Inativo' end end);
 end if;
 return p;
end $$;

create function integracao_documentos_privado.nucleo(chave text) returns jsonb language plpgsql stable set search_path='' as $$
declare e record;k public.processos_kanban;n jsonb;m record;quantidade integer;ref uuid;
begin
 if not integracao_documentos_privado.ativo() then raise exception 'Perfil ativo necessário' using errcode='42501';end if;
 select * into e from (
  select colecao,registro_id,dados,referencia_tabela,referencia_id,1 prioridade from public.integracao_nucleos
  union all select colecao,registro_id,dados,referencia_tabela,referencia_id,2 from public.integracao_complementos
 ) x where colecao='nucleos' and (registro_id=chave or referencia_id::text=chave) order by (registro_id=chave) desc,prioridade limit 1;
 n:=case when found then e.dados||jsonb_build_object('id',e.registro_id) else jsonb_build_object('id',chave) end;
 if e.referencia_tabela='processos_kanban' then ref:=e.referencia_id;end if;
 select * into k from public.processos_kanban where id=ref or id::text=chave limit 1;
 if found then
  if nullif(btrim(k.estado),'') is null then raise exception 'A UF do núcleo não está informada. Confira o cadastro antes de continuar.' using errcode='PT409';end if;
  select count(*) into quantidade from public.fin_receb_municipios where integracao_documentos_privado.normalizar(nome)=integracao_documentos_privado.normalizar(k.municipio) and nullif(btrim(uf),'')=btrim(k.estado);
  if quantidade<>1 then raise exception 'Confira o município vinculado ao núcleo antes de emitir o termo' using errcode='PT409';end if;
  select * into m from public.fin_receb_municipios where integracao_documentos_privado.normalizar(nome)=integracao_documentos_privado.normalizar(k.municipio) and nullif(btrim(uf),'')=btrim(k.estado);
  n:=n||jsonb_build_object('nome',k.nucleo,'codigo',coalesce(nullif(n->>'codigo',''),k.nucleo),'municipioId',m.id,'aliases',jsonb_build_array(n->>'id',k.id::text));
 elsif e.registro_id is null or e.referencia_tabela='processos_kanban' then raise exception 'Núcleo não encontrado ou sem acesso' using errcode='42501';
 else
  if not exists(select 1 from public.fin_receb_municipios where id::text=n->>'municipioId') then raise exception 'Município não encontrado ou sem acesso' using errcode='42501';end if;
  n:=n||jsonb_build_object('aliases',jsonb_build_array(n->>'id'));
 end if;
 return n;
end $$;

create table public.integracao_termos_modelos (
 id uuid primary key default gen_random_uuid(),modelo_id uuid not null,pedido_id uuid not null unique,
 municipio_id uuid not null references public.fin_receb_municipios(id),variante text not null,titulo text not null,corpo text not null,
 obrigatorios text[] not null default '{}',versao integer not null,versao_base integer not null default 0,
 autor uuid not null default auth.uid() references public.profiles(id),criado_em timestamptz not null default clock_timestamp(),
 unique(modelo_id,versao),check(versao>0),check(char_length(titulo) between 1 and 160),check(char_length(variante) between 1 and 100),check(char_length(corpo) between 1 and 100000)
);
create index integracao_termos_modelos_municipio on public.integracao_termos_modelos(municipio_id,modelo_id,versao desc);
alter table public.integracao_termos_modelos enable row level security;
revoke all on public.integracao_termos_modelos from public,anon,authenticated;
grant select,insert on public.integracao_termos_modelos to authenticated;
create policy ler on public.integracao_termos_modelos for select to authenticated using(integracao_documentos_privado.ativo() and exists(select 1 from public.fin_receb_municipios m where m.id=municipio_id));
create policy criar on public.integracao_termos_modelos for insert to authenticated with check(integracao_documentos_privado.gerir_modelos() and autor=auth.uid() and exists(select 1 from public.fin_receb_municipios m where m.id=municipio_id));

create function integracao_documentos_privado.campos_termo() returns text[] language sql immutable set search_path='' as $$select array['requerente.nome','requerente.documento','requerente.rg','requerente.estadoCivil','requerente.profissao','requerente.nacionalidade','conjuge.nome','conjuge.documento','qualificacao','codigo','unidade.codigo','unidade.area','unidade.loteQuadra','nucleo.nome','nucleo.codigo','municipio.nome','municipio.uf','modalidade','endereco','data','observacao']$$;
create function integracao_documentos_privado.modelo_json(m public.integracao_termos_modelos) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',m.id,'modeloId',m.modelo_id,'municipioId',m.municipio_id,'variante',m.variante,'titulo',m.titulo,'corpo',m.corpo,'obrigatorios',to_jsonb(m.obrigatorios),'versao',m.versao)
$$;
create function integracao_documentos_privado.modelo_validar() returns trigger language plpgsql set search_path='' as $$
declare anterior public.integracao_termos_modelos;campo text;presentes text[];
begin
 if not integracao_documentos_privado.gerir_modelos() then raise exception 'Sem permissão para administrar modelos' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('termo-modelo:'||new.modelo_id::text,0));
 select * into anterior from public.integracao_termos_modelos where modelo_id=new.modelo_id order by versao desc limit 1;
 if new.versao_base is distinct from coalesce(anterior.versao,0) then raise exception 'O modelo foi alterado por outra pessoa. Reabra a versão atual.' using errcode='PT409';end if;
 if anterior.id is not null and anterior.municipio_id<>new.municipio_id then raise exception 'O município de um modelo existente não pode ser trocado' using errcode='42501';end if;
 if btrim(new.titulo)='' or btrim(new.variante)='' or btrim(new.corpo)='' then raise exception 'Informe título, variante e texto do modelo';end if;
 select coalesce(array_agg(distinct regexp_replace(x[1],'^\s+|\s+$','','g')),'{}') into presentes from regexp_matches(new.corpo,'\{\{\s*([^{}]+?)\s*\}\}','g') x;
 if regexp_replace(new.corpo,'\{\{\s*([^{}]+?)\s*\}\}','','g') ~ '\{\{|\}\}' then raise exception 'Há um marcador incompleto no modelo';end if;
 foreach campo in array presentes loop if not campo=any(integracao_documentos_privado.campos_termo()) then raise exception 'Marcador não reconhecido: %',campo;end if;end loop;
 foreach campo in array new.obrigatorios loop if not campo=any(presentes) then raise exception 'Campo obrigatório ausente do texto: %',campo;end if;end loop;
 new.versao:=coalesce(anterior.versao,0)+1;new.autor:=auth.uid();new.criado_em:=clock_timestamp();return new;
end $$;
create trigger termos_modelo_validar before insert on public.integracao_termos_modelos for each row execute function integracao_documentos_privado.modelo_validar();
create function integracao_documentos_privado.imutavel() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Versões e documentos emitidos são imutáveis' using errcode='42501';end $$;
create trigger termos_modelo_imutavel before update or delete on public.integracao_termos_modelos for each row execute function integracao_documentos_privado.imutavel();

create function integracao_documentos_privado.preparar_termo(processo_id text,unidade_id text,modelo_versao uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare p jsonb;n jsonb;m public.fin_receb_municipios;modelo public.integracao_termos_modelos;un jsonb;indice bigint;total integer;casal boolean;dados jsonb;qualificacao text;endereco text;
begin
 if not integracao_documentos_privado.emitir_termos() then raise exception 'Sem permissão para gerar termos' using errcode='42501';end if;
 p:=integracao_documentos_privado.morador(processo_id);
 if coalesce(p->>'situacao','Ativo')<>'Ativo' or p#>'{extras,arquivamento,ativo}'='true'::jsonb then raise exception 'O cadastro precisa estar ativo para emitir novos termos';end if;
 if nullif(p->>'nucleoId','') is null then raise exception 'Vincule o morador a um núcleo e salve sua unidade antes de emitir o termo';end if;
 n:=integracao_documentos_privado.nucleo(p->>'nucleoId');
 if n->>'municipioId' is distinct from p->>'municipioId' then raise exception 'O núcleo e o morador pertencem a municípios diferentes' using errcode='PT409';end if;
 select * into m from public.fin_receb_municipios where id::text=p->>'municipioId';
 if not found then raise exception 'Município não encontrado ou sem acesso' using errcode='42501';end if;
 select * into modelo from public.integracao_termos_modelos where id=modelo_versao and municipio_id=m.id;
 if not found then raise exception 'Modelo não encontrado para este município' using errcode='42501';end if;
 if jsonb_typeof(p->'unidades') is distinct from 'array' then raise exception 'Cadastre e salve a unidade antes de emitir o termo';end if;
 select value,ordinality into un,indice from jsonb_array_elements(p->'unidades') with ordinality where value->>'id'=unidade_id;
 if not found or (select count(*) from jsonb_array_elements(p->'unidades') u where u->>'id'=unidade_id)<>1 then raise exception 'Unidade não encontrada neste cadastro' using errcode='42501';end if;
 total:=jsonb_array_length(p->'unidades');
 casal:=p#>>'{requerente,tipoPessoa}' is distinct from 'juridica' and p#>>'{requerente,estadoCivil}' in ('Casado(a)','União estável') and p#>>'{conjuge,beneficiario}' is distinct from 'nao';
 qualificacao:=coalesce(nullif(p#>>'{qualificacaoRequerente,quali_compromisso}',''),nullif(p#>>'{qualificacao,textos,compromisso}',''),nullif(p#>>'{qualificacao,textos,completa}',''),'');
 -- Um texto manual desatualizado deve ser revisto conscientemente no cadastro.
 if p#>'{qualificacao,desatualizada}'='true'::jsonb and nullif(p#>>'{qualificacaoRequerente,quali_compromisso}','') is null then qualificacao:='';end if;
 endereco:=concat_ws(', ',nullif(p#>>'{endereco,logradouro}',''),case when nullif(p#>>'{endereco,numero}','') is not null then 'nº '||(p#>>'{endereco,numero}') end,nullif(p#>>'{endereco,complemento}',''),nullif(p#>>'{endereco,bairro}',''),nullif(concat_ws('/',nullif(p#>>'{endereco,municipio}',''),nullif(p#>>'{endereco,uf}','')),''),case when nullif(p#>>'{endereco,cep}','') is not null then 'CEP '||(p#>>'{endereco,cep}') end);
 dados:=jsonb_build_object('requerente.nome',p#>>'{requerente,nome}','requerente.documento',case when p#>>'{requerente,tipoPessoa}'='juridica' then p#>>'{requerente,cnpj}' else p#>>'{requerente,cpf}' end,'requerente.rg',p#>>'{requerente,rg}','requerente.estadoCivil',p#>>'{requerente,estadoCivil}','requerente.profissao',p#>>'{requerente,profissao}','requerente.nacionalidade',p#>>'{requerente,nacionalidade}','conjuge.nome',case when casal then p#>>'{conjuge,nome}' else '' end,'conjuge.documento',case when casal then p#>>'{conjuge,cpf}' else '' end,'qualificacao',qualificacao,'codigo',p->>'codigo','unidade.codigo',coalesce(p->>'codigo','')||case when total>1 then chr(64+indice::integer) else '' end,'unidade.area',un->>'area','unidade.loteQuadra',un->>'loteQuadra','nucleo.nome',coalesce(nullif(n->>'nome',''),n->>'codigo'),'nucleo.codigo',n->>'codigo','municipio.nome',m.nome,'municipio.uf',m.uf,'modalidade',p#>>'{social,modalidade}','endereco',endereco,'data',to_char(clock_timestamp() at time zone 'America/Sao_Paulo','DD/MM/YYYY'),'observacao',p#>>'{compromisso,observacao}');
 return jsonb_build_object('modelo',integracao_documentos_privado.modelo_json(modelo),'dados',dados,'processoId',p->>'id','unidadeId',unidade_id,'municipioId',m.id,'nucleoId',n->>'id');
end $$;

create function integracao_documentos_privado.preencher_termo(corpo text,dados jsonb,obrigatorios text[]) returns text language plpgsql immutable set search_path='' as $$
declare resultado text:='';restante text:=corpo;marca text[];chave text;pos integer;valor text;
begin
 foreach chave in array obrigatorios loop
  valor:=dados->>chave;
  if nullif(btrim(valor),'') is null or (chave='qualificacao' and valor ~ '\[[^\]]+\]|_{4,}') then raise exception 'Falta preencher o campo obrigatório: %. Complete o cadastro e gere nova prévia.',chave;end if;
 end loop;
 for marca in select regexp_matches(corpo,'(\{\{\s*([^{}]+?)\s*\}\})','g') loop
  chave:=regexp_replace(marca[2],'^\s+|\s+$','','g');pos:=strpos(restante,marca[1]);
  resultado:=resultado||substr(restante,1,pos-1)||coalesce(dados->>chave,'');restante:=substr(restante,pos+char_length(marca[1]));
 end loop;
 resultado:=resultado||restante;
 if char_length(resultado)>1000000 then raise exception 'O documento excede o tamanho permitido';end if;
 return resultado;
end $$;

create table public.integracao_termos_emissoes (
 id uuid primary key default gen_random_uuid(),pedido_id uuid not null unique,processo_id text not null,unidade_id text not null,
 modelo_versao_id uuid not null references public.integracao_termos_modelos(id),modelo_id uuid not null,versao integer not null,
 municipio_id uuid not null references public.fin_receb_municipios(id),nucleo_id text not null,titulo text not null,texto text not null,texto_esperado text not null,
 dados jsonb not null,autor uuid not null default auth.uid() references public.profiles(id),autor_nome text not null,emitido_em timestamptz not null default clock_timestamp()
);
create index integracao_termos_emissoes_processo on public.integracao_termos_emissoes(processo_id,emitido_em desc);
alter table public.integracao_termos_emissoes enable row level security;
revoke all on public.integracao_termos_emissoes from public,anon,authenticated;
grant select,insert on public.integracao_termos_emissoes to authenticated;
create function integracao_documentos_privado.acesso_morador(chave text) returns boolean language plpgsql stable set search_path='' as $$begin perform integracao_documentos_privado.morador(chave);return true;exception when insufficient_privilege then return false;end $$;
create policy ler on public.integracao_termos_emissoes for select to authenticated using(integracao_documentos_privado.ativo() and integracao_documentos_privado.acesso_morador(processo_id));
create policy criar on public.integracao_termos_emissoes for insert to authenticated with check(integracao_documentos_privado.emitir_termos() and autor=auth.uid() and integracao_documentos_privado.acesso_morador(processo_id));
create function integracao_documentos_privado.emissao_json(e public.integracao_termos_emissoes) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('id',e.id,'processoId',e.processo_id,'unidadeId',e.unidade_id,'modeloVersaoId',e.modelo_versao_id,'modeloId',e.modelo_id,'versao',e.versao,'municipioId',e.municipio_id,'nucleoId',e.nucleo_id,'titulo',e.titulo,'texto',e.texto,'emitidoEm',e.emitido_em,'por',e.autor_nome)$$;
create function integracao_documentos_privado.emissao_validar() returns trigger language plpgsql set search_path='' as $$
declare preparo jsonb;corpo text;obrigatorios text[];
begin
 preparo:=integracao_documentos_privado.preparar_termo(new.processo_id,new.unidade_id,new.modelo_versao_id);
 select array_agg(value) into obrigatorios from jsonb_array_elements_text(preparo#>'{modelo,obrigatorios}');
 corpo:=integracao_documentos_privado.preencher_termo(preparo#>>'{modelo,corpo}',preparo->'dados',coalesce(obrigatorios,'{}'));
 if corpo is distinct from new.texto_esperado then raise exception 'O cadastro ou modelo mudou depois da prévia. Gere uma nova prévia antes de emitir.' using errcode='PT409';end if;
 new.processo_id:=preparo->>'processoId';new.municipio_id:=(preparo->>'municipioId')::uuid;new.nucleo_id:=preparo->>'nucleoId';new.modelo_id:=(preparo#>>'{modelo,modeloId}')::uuid;new.versao:=(preparo#>>'{modelo,versao}')::integer;
 new.titulo:=preparo#>>'{modelo,titulo}';new.texto:=corpo;new.dados:=preparo->'dados';new.autor:=auth.uid();select nome into new.autor_nome from public.profiles where id=auth.uid();new.emitido_em:=clock_timestamp();return new;
end $$;
create trigger termos_emissao_validar before insert on public.integracao_termos_emissoes for each row execute function integracao_documentos_privado.emissao_validar();
create trigger termos_emissao_imutavel before update or delete on public.integracao_termos_emissoes for each row execute function integracao_documentos_privado.imutavel();

-- A emissão explícita acrescenta somente sua referência ao fluxo existente.
-- O UPDATE é invoker: falhas de RLS/contrato anulam também o snapshot inserido.
create function integracao_documentos_privado.emissao_referenciar() returns trigger language plpgsql set search_path='' as $$
declare atual jsonb;documentos jsonb;referencia jsonb;origem text;alterados integer;
begin
 select dados into atual from public.integracao_moradores where colecao='processos' and registro_id=new.processo_id for update;
 if found then origem:='integracao_moradores';
 else
  select dados into atual from public.integracao_complementos where colecao='processos' and registro_id=new.processo_id for update;
  if not found then raise exception 'Não foi possível registrar a emissão no cadastro autorizado' using errcode='42501';end if;
  origem:='integracao_complementos';
 end if;
 documentos:=coalesce(atual->'documentosGerados','[]'::jsonb);
 if jsonb_typeof(documentos) is distinct from 'array' then raise exception 'Confira o histórico de documentos do cadastro antes de emitir o termo' using errcode='PT409';end if;
 referencia:=jsonb_build_object('id',new.id,'tipo','termo_compromisso','emissaoId',new.id,'modeloVersaoId',new.modelo_versao_id,'modeloVersao',new.versao,'municipioId',new.municipio_id,'nome',new.titulo,'por',new.autor_nome,'data',new.emitido_em);
 if exists(select 1 from jsonb_array_elements(documentos) d where d->>'emissaoId'=new.id::text or d->>'id'=new.id::text) then raise exception 'A referência da emissão já existe no histórico' using errcode='PT409';end if;
 execute format('update public.%I set dados=jsonb_set(dados,''{documentosGerados}'',$1,true),updated_at=clock_timestamp() where colecao=''processos'' and registro_id=$2',origem) using documentos||jsonb_build_array(referencia),new.processo_id;
 get diagnostics alterados=row_count;
 if alterados<>1 then raise exception 'Não foi possível registrar a emissão no cadastro autorizado' using errcode='42501';end if;
 return new;
end $$;
create trigger termos_emissao_referenciar after insert on public.integracao_termos_emissoes for each row execute function integracao_documentos_privado.emissao_referenciar();

create function public.integracao_termos_operar(p_acao text,p_dados jsonb) returns jsonb language plpgsql set search_path='' as $$
declare m public.integracao_termos_modelos;e public.integracao_termos_emissoes;pedido uuid;modelo uuid;obrigatorios text[];res jsonb;municipio uuid;
begin
 if not integracao_documentos_privado.ativo() then raise exception 'Perfil ativo necessário' using errcode='42501';end if;
 if p_acao='listar_modelos' then
  municipio:=(p_dados->>'municipioId')::uuid;
  if not exists(select 1 from public.fin_receb_municipios where id=municipio) then raise exception 'Município não encontrado ou sem acesso' using errcode='42501';end if;
  select coalesce(jsonb_agg(integracao_documentos_privado.modelo_json(x) order by x.variante,x.titulo),'[]') into res from (select distinct on(modelo_id) * from public.integracao_termos_modelos where municipio_id=municipio order by modelo_id,versao desc)x;return res;
 elsif p_acao='listar_emissoes' then
  res:=integracao_documentos_privado.morador(p_dados->>'processoId');
  return (select coalesce(jsonb_agg(integracao_documentos_privado.emissao_json(x) order by x.emitido_em desc),'[]') from public.integracao_termos_emissoes x where processo_id=res->>'id');
 elsif p_acao='preparar' then return integracao_documentos_privado.preparar_termo(p_dados->>'processoId',p_dados->>'unidadeId',(p_dados->>'modeloVersaoId')::uuid);
 elsif p_acao='salvar_modelo' then
  if not integracao_documentos_privado.gerir_modelos() then raise exception 'Sem permissão para administrar modelos' using errcode='42501';end if;
  pedido:=(p_dados->>'pedidoId')::uuid;if pedido is null then raise exception 'Identificador da operação obrigatório';end if;
  perform pg_advisory_xact_lock(hashtextextended('termo-pedido:'||pedido::text,0));
  select * into m from public.integracao_termos_modelos where pedido_id=pedido;
  if found then
   if m.autor<>auth.uid() or m.municipio_id::text is distinct from p_dados->>'municipioId' or m.corpo is distinct from p_dados->>'corpo' or m.titulo is distinct from p_dados->>'titulo' or m.variante is distinct from p_dados->>'variante' or to_jsonb(m.obrigatorios) is distinct from p_dados->'obrigatorios' or (nullif(p_dados->>'id','') is not null and m.modelo_id::text is distinct from p_dados->>'id') or m.versao_base is distinct from coalesce((p_dados->>'versaoBase')::integer,0) then raise exception 'O identificador já corresponde a outra gravação' using errcode='PT409';end if;
   return integracao_documentos_privado.modelo_json(m);
  end if;
  if jsonb_typeof(p_dados->'obrigatorios') is distinct from 'array' then raise exception 'Selecione os campos obrigatórios';end if;
  select coalesce(array_agg(value),'{}') into obrigatorios from jsonb_array_elements_text(p_dados->'obrigatorios');
  modelo:=coalesce(nullif(p_dados->>'id','')::uuid,gen_random_uuid());
  insert into public.integracao_termos_modelos(modelo_id,pedido_id,municipio_id,variante,titulo,corpo,obrigatorios,versao,versao_base) values(modelo,pedido,(p_dados->>'municipioId')::uuid,p_dados->>'variante',p_dados->>'titulo',p_dados->>'corpo',obrigatorios,1,coalesce((p_dados->>'versaoBase')::integer,0)) returning * into m;
  return integracao_documentos_privado.modelo_json(m);
 elsif p_acao='emitir' then
  if not integracao_documentos_privado.emitir_termos() then raise exception 'Sem permissão para gerar termos' using errcode='42501';end if;
  pedido:=(p_dados->>'pedidoId')::uuid;if pedido is null then raise exception 'Identificador da operação obrigatório';end if;
  perform pg_advisory_xact_lock(hashtextextended('termo-emissao:'||pedido::text,0));
  select * into e from public.integracao_termos_emissoes where pedido_id=pedido;
  if found then
   if e.autor<>auth.uid() or e.processo_id is distinct from p_dados->>'processoId' or e.unidade_id is distinct from p_dados->>'unidadeId' or e.modelo_versao_id::text is distinct from p_dados->>'modeloVersaoId' or e.texto_esperado is distinct from p_dados->>'textoEsperado' then raise exception 'O identificador já corresponde a outra emissão' using errcode='PT409';end if;
   return integracao_documentos_privado.emissao_json(e);
  end if;
  insert into public.integracao_termos_emissoes(pedido_id,processo_id,unidade_id,modelo_versao_id,texto_esperado) values(pedido,p_dados->>'processoId',p_dados->>'unidadeId',(p_dados->>'modeloVersaoId')::uuid,p_dados->>'textoEsperado') returning * into e;
  return integracao_documentos_privado.emissao_json(e);
 end if;
 raise exception 'Ação de termos não reconhecida';
end $$;

create function public.integracao_qualificacoes_nucleo(p_nucleo text,p_busca text default '',p_ids text[] default null,p_inicio integer default 0,p_limite integer default 30) returns jsonb language plpgsql stable set search_path='' as $$
declare n jsonb;res jsonb;
begin
 n:=integracao_documentos_privado.nucleo(p_nucleo);
 if p_limite not between 1 and 500 or p_inicio<0 or char_length(coalesce(p_busca,''))>200 or coalesce(cardinality(p_ids),0)>50000 then raise exception 'Parâmetros de consulta inválidos';end if;
 with candidatos as (
  select colecao,registro_id,dados,referencia_id,1 prioridade from public.integracao_moradores
  union all select colecao,registro_id,dados,referencia_id,2 from public.integracao_complementos
 ),atuais as (select distinct on(registro_id) * from candidatos where colecao='processos' order by registro_id,prioridade),
 vinculados as (select integracao_documentos_privado.morador(registro_id) p from atuais where (n->'aliases') ? (dados->>'nucleoId') and (p_ids is null or registro_id=any(p_ids))),
 filtrados as (select p from vinculados where p->>'municipioId'=n->>'municipioId' and (coalesce(p_busca,'')='' or strpos(integracao_documentos_privado.normalizar(coalesce(p->>'codigo','')||' '||coalesce(p#>>'{requerente,nome}','')),integracao_documentos_privado.normalizar(p_busca))>0)),
 pagina as (select p from filtrados order by p->>'codigo',p->>'id' limit p_limite offset p_inicio)
 select jsonb_build_object('items',coalesce((select jsonb_agg(p order by p->>'codigo',p->>'id') from pagina),'[]'),'total',(select count(*) from filtrados)) into res;
 return res;
end $$;

revoke all on function integracao_documentos_privado.ativo(),integracao_documentos_privado.gerir_modelos(),integracao_documentos_privado.emitir_termos(),integracao_documentos_privado.normalizar(text),integracao_documentos_privado.morador(text),integracao_documentos_privado.nucleo(text),integracao_documentos_privado.campos_termo(),integracao_documentos_privado.modelo_json(public.integracao_termos_modelos),integracao_documentos_privado.modelo_validar(),integracao_documentos_privado.imutavel(),integracao_documentos_privado.preparar_termo(text,text,uuid),integracao_documentos_privado.preencher_termo(text,jsonb,text[]),integracao_documentos_privado.acesso_morador(text),integracao_documentos_privado.emissao_json(public.integracao_termos_emissoes),integracao_documentos_privado.emissao_validar(),integracao_documentos_privado.emissao_referenciar() from public,anon;
grant execute on function integracao_documentos_privado.ativo(),integracao_documentos_privado.gerir_modelos(),integracao_documentos_privado.emitir_termos(),integracao_documentos_privado.normalizar(text),integracao_documentos_privado.morador(text),integracao_documentos_privado.nucleo(text),integracao_documentos_privado.campos_termo(),integracao_documentos_privado.modelo_json(public.integracao_termos_modelos),integracao_documentos_privado.preparar_termo(text,text,uuid),integracao_documentos_privado.preencher_termo(text,jsonb,text[]),integracao_documentos_privado.acesso_morador(text),integracao_documentos_privado.emissao_json(public.integracao_termos_emissoes) to authenticated;
revoke all on function public.integracao_termos_operar(text,jsonb),public.integracao_qualificacoes_nucleo(text,text,text[],integer,integer) from public,anon;
grant execute on function public.integracao_termos_operar(text,jsonb),public.integracao_qualificacoes_nucleo(text,text,text[],integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
