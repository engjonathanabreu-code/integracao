-- Reversão de supabase/migrations/20261125135233_conflitos_negocio_sem_retry.sql.
-- Devolve o literal '40001' às seis funções, restaurando o corpo anterior byte a byte.
-- Tudo ou nada: só age se cada função estiver exatamente como a migration a deixou
-- (corpo atual, com 'PT409' trocado de volta, igual ao md5 original). Qualquer divergência
-- aborta sem alterar nada. Não toca em dados, ACL, dono, security definer nem search_path.
-- Atenção: reverter reintroduz a repetição sem limite do PostgREST nas recusas de conflito.

begin;
set local lock_timeout = '5s';

do $reversao$
declare
  alvo record;
  funcao regprocedure;
  corpo text;
  definicao text;
  restaurada text;
  ocorrencias integer;
  definicoes text[] := '{}';
begin
  for alvo in
    select * from (values
      ('public.integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid)', '53fb35c55a6a560b8ddea6db37ada23c', 1),
      ('public.integracao_documental_alternar(boolean,bigint)', 'af3673f98553b7dbf42c8ebb0fa54e3f', 1),
      ('public.integracao_documentos_observacoes_operar(text,text,jsonb)', '617587e13ef73d5360c54ed3f6e8bee2', 2),
      ('integracao_documentos_observacoes_privado.proteger()', '2ac1ffcbab6a9242daf7121d943b3479', 1),
      ('public.integracao_mailing_salvar(text,bigint,jsonb)', 'f82f3e6070e9252a5e283efd3d1c9b15', 3),
      ('public.reorder_plan_steps(uuid,uuid[],uuid[])', '0411647835ba76f881c5da2f5e99bcf1', 1)
    ) as t(assinatura, md5_original, literais)
  loop
    funcao := to_regprocedure(alvo.assinatura);
    if funcao is null then
      raise exception 'conflitos_negocio_sem_retry (reversão): função % não encontrada; nada foi alterado', alvo.assinatura;
    end if;
    select prosrc into corpo from pg_catalog.pg_proc where oid = funcao;
    if md5(corpo) = alvo.md5_original then
      raise exception 'conflitos_negocio_sem_retry (reversão): % já está no corpo original (40001); nada foi alterado', alvo.assinatura;
    end if;
    definicao := pg_get_functiondef(funcao);
    ocorrencias := (length(definicao) - length(replace(definicao, '''PT409''', ''))) / length('''PT409''');
    if position('''40001''' in corpo) > 0
       or ocorrencias <> alvo.literais
       or md5(replace(corpo, '''PT409''', '''40001''')) <> alvo.md5_original then
      raise exception 'conflitos_negocio_sem_retry (reversão): % não está como a migration deixou (md5 %); revise antes de reverter. Nada foi alterado',
        alvo.assinatura, md5(corpo);
    end if;
    restaurada := replace(definicao, '''PT409''', '''40001''');
    definicoes := definicoes || restaurada;
  end loop;

  foreach restaurada in array definicoes loop
    execute restaurada;
  end loop;

  for alvo in
    select * from (values
      ('public.integracao_atribuicoes_salvar(uuid,bigint,jsonb,text,uuid)', '53fb35c55a6a560b8ddea6db37ada23c'),
      ('public.integracao_documental_alternar(boolean,bigint)', 'af3673f98553b7dbf42c8ebb0fa54e3f'),
      ('public.integracao_documentos_observacoes_operar(text,text,jsonb)', '617587e13ef73d5360c54ed3f6e8bee2'),
      ('integracao_documentos_observacoes_privado.proteger()', '2ac1ffcbab6a9242daf7121d943b3479'),
      ('public.integracao_mailing_salvar(text,bigint,jsonb)', 'f82f3e6070e9252a5e283efd3d1c9b15'),
      ('public.reorder_plan_steps(uuid,uuid[],uuid[])', '0411647835ba76f881c5da2f5e99bcf1')
    ) as t(assinatura, md5_original)
  loop
    select prosrc into corpo from pg_catalog.pg_proc where oid = to_regprocedure(alvo.assinatura);
    if md5(corpo) <> alvo.md5_original then
      raise exception 'conflitos_negocio_sem_retry (reversão): % não voltou ao corpo original; transação desfeita', alvo.assinatura;
    end if;
  end loop;
end
$reversao$;

commit;
