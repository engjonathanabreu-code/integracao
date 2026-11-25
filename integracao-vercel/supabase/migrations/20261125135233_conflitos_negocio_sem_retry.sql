-- Recusas determinísticas (versão ou revisão divergente) de seis funções ainda usavam
-- SQLSTATE 40001. O PostgREST 14 trata 40001 como falha transitória e repete a transação
-- inteira sem limite; como a recusa se repete a cada tentativa, a requisição não termina.
-- Mesma causa e mesma técnica de 20260928152249_conflitos_sem_retry.sql (integracao_gravar):
-- troca-se somente o literal '40001' por 'PT409', que o PostgREST devolve como HTTP 409
-- sem repetir. Mensagens, validações, permissões, dono, ACL, security definer,
-- search_path e dados não mudam.
--
-- Tudo ou nada: cada função precisa existir com o corpo esperado (md5 de prosrc) e com a
-- quantidade esperada do literal. Qualquer divergência aborta antes da primeira alteração.
-- Não é idempotente de propósito: reaplicar falha avisando que a correção já está instalada.
-- Reversão: supabase/operacoes/conflitos-negocio-sem-retry-reversao.sql

begin;
set local lock_timeout = '5s';

do $correcao$
declare
  alvo record;
  funcao regprocedure;
  corpo text;
  definicao text;
  corrigida text;
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
    ) as t(assinatura, md5_esperado, literais)
  loop
    funcao := to_regprocedure(alvo.assinatura);
    if funcao is null then
      raise exception 'conflitos_negocio_sem_retry: função % não encontrada; nada foi alterado', alvo.assinatura;
    end if;
    select prosrc into corpo from pg_catalog.pg_proc where oid = funcao;
    if md5(corpo) <> alvo.md5_esperado then
      if position('''40001''' in corpo) = 0
         and md5(replace(corpo, '''PT409''', '''40001''')) = alvo.md5_esperado then
        raise exception 'conflitos_negocio_sem_retry: % já está corrigida (PT409); nada foi alterado', alvo.assinatura;
      end if;
      raise exception 'conflitos_negocio_sem_retry: % tem corpo diferente do esperado (md5 %, esperado %); revise antes de aplicar. Nada foi alterado',
        alvo.assinatura, md5(corpo), alvo.md5_esperado;
    end if;
    definicao := pg_get_functiondef(funcao);
    ocorrencias := (length(definicao) - length(replace(definicao, '''40001''', ''))) / length('''40001''');
    if ocorrencias <> alvo.literais then
      raise exception 'conflitos_negocio_sem_retry: % tem % ocorrência(s) do literal 40001, esperado %; nada foi alterado',
        alvo.assinatura, ocorrencias, alvo.literais;
    end if;
    corrigida := replace(definicao, '''40001''', '''PT409''');
    if length(corrigida) <> length(definicao) or corrigida = definicao then
      raise exception 'conflitos_negocio_sem_retry: substituição inesperada em %; nada foi alterado', alvo.assinatura;
    end if;
    definicoes := definicoes || corrigida;
  end loop;

  -- Só altera depois de todas as conferências acima terem passado.
  foreach corrigida in array definicoes loop
    execute corrigida;
  end loop;

  -- Confere o resultado: o corpo instalado é o original com o literal trocado, byte a byte.
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
    if position('''40001''' in corpo) > 0
       or md5(replace(corpo, '''PT409''', '''40001''')) <> alvo.md5_original then
      raise exception 'conflitos_negocio_sem_retry: % não ficou como esperado após a troca; transação desfeita', alvo.assinatura;
    end if;
  end loop;
end
$correcao$;

commit;
