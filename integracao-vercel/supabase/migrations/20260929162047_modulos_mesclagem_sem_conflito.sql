-- Compatible JSON edits across the eight additional modules reproduced by the account audit.
-- Keep chat/notification-specific read rules, configuration, file pointers and canonical ERP checks intact.
DO $patch$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure) INTO original;
 IF md5(original)<>'f5766aff304da230793998231219dc2c' THEN
  RAISE EXCEPTION 'integracao_gravar changed; review module merge before applying';
 END IF;
 updated:=replace(original,
 $old$IF tabela='integracao_moradores' AND chave->>'colecao'='processos'$old$,
 $new$IF ((tabela='integracao_moradores' AND chave->>'colecao'='processos') OR tabela IN (
         'integracao_nucleos','integracao_municipios','integracao_remessas','integracao_metas',
         'integracao_planos','integracao_ordens_servico','integracao_calendario','integracao_usuarios'))$new$);
 IF updated=original THEN RAISE EXCEPTION 'Module merge anchor absent'; END IF;
 updated:=replace(updated,
 $old$      mudancas:=jsonb_set(mudancas,'{dados}',public.integracao_mesclar_json_seguro(
        anterior->'dados',mudancas->'dados',atual->'dados'));$old$,
 $new$      BEGIN
       mudancas:=jsonb_set(mudancas,'{dados}',public.integracao_mesclar_json_seguro(
         anterior->'dados',mudancas->'dados',atual->'dados'));
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
       RAISE EXCEPTION 'Conflito em %. O mesmo campo recebeu alterações diferentes. Sua edição foi preservada para revisão.',tabela USING ERRCODE='PT409';
      END;$new$);
 IF position('EXCEPTION WHEN SQLSTATE ''PT409''' in updated)=0 THEN RAISE EXCEPTION 'Module error anchor absent'; END IF;
 EXECUTE updated;
END $patch$;
