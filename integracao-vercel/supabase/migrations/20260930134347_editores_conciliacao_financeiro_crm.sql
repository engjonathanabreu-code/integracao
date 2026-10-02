-- Dedicated versioned editors use the same merge under their existing RLS and
-- validation. Legacy endpoints remain strict for clients without a baseline.
CREATE FUNCTION public.integracao_financeiro_editar_conciliado(p_id uuid,p_anterior jsonb,p_dados jsonb)
RETURNS public.fin_receb_parcelas LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE atual public.fin_receb_parcelas; anterior public.fin_receb_parcelas; local public.fin_receb_parcelas; k text; dados jsonb:='{}'; alvo jsonb; antigo jsonb; remoto jsonb;
BEGIN
 IF NOT integracao_financeiro_privado.operar() THEN RAISE EXCEPTION 'Acesso financeiro somente para consulta'; END IF;
 SELECT * INTO atual FROM public.fin_receb_parcelas WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela indisponível ou sem permissão'; END IF;
 IF jsonb_typeof(p_anterior) IS DISTINCT FROM 'object' OR jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Informe os valores anteriores'; END IF;
 anterior:=jsonb_populate_record(NULL::public.fin_receb_parcelas,p_anterior);
 local:=jsonb_populate_record(anterior,p_dados);
 FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
  IF k NOT IN ('vencimento','valor_previsto','juros','multa','linha_digitavel','nosso_numero','documento','status','pago_em','valor_liquidado','tipo') OR NOT p_anterior ? k THEN RAISE EXCEPTION 'Campo financeiro inválido ou sem valor anterior'; END IF;
  antigo:=to_jsonb(anterior)->k;alvo:=to_jsonb(local)->k;remoto:=to_jsonb(atual)->k;
  IF k='linha_digitavel' THEN antigo:=coalesce(to_jsonb(nullif(anterior.linha_digitavel,'')),'null'::jsonb);alvo:=coalesce(to_jsonb(nullif(local.linha_digitavel,'')),'null'::jsonb); END IF;
  IF alvo IS DISTINCT FROM antigo THEN
   BEGIN dados:=dados||jsonb_build_object(k,public.integracao_mesclar_json_seguro(antigo,alvo,remoto));
   EXCEPTION WHEN SQLSTATE 'PT409' THEN RAISE EXCEPTION 'A parcela recebeu valores diferentes no campo %. Revise para continuar.',k USING ERRCODE='PT409'; END;
  END IF;
 END LOOP;
 IF dados='{}' OR to_jsonb(atual) @> dados THEN RETURN atual; END IF;
 RETURN public.integracao_financeiro_editar(p_id,atual.versao,dados);
END $$;
REVOKE ALL ON FUNCTION public.integracao_financeiro_editar_conciliado(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_financeiro_editar_conciliado(uuid,jsonb,jsonb) TO authenticated;

CREATE FUNCTION public.integracao_crm_institucional_conciliado(p_id uuid,p_anterior jsonb,p_dados jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE atual public.integracao_crm_institucionais; dados jsonb; k text;
BEGIN
 -- The original privileged validator locks and checks the version at write time.
 -- This read uses the existing SELECT policy; no UPDATE grant is added.
 SELECT * INTO atual FROM public.integracao_crm_institucionais WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Negócio indisponível ou sem permissão'; END IF;
 IF jsonb_typeof(p_anterior) IS DISTINCT FROM 'object' OR jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Informe os valores anteriores'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
  IF k NOT IN ('nome','contato','produto','valor','responsavel_id','status','motivo_perda') OR NOT p_anterior ? k THEN RAISE EXCEPTION 'Campo institucional inválido ou sem valor anterior'; END IF;
 END LOOP;
 -- Only edited fields are proposed; other current fields remain current.
 dados:=to_jsonb(atual);
 FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
  BEGIN dados:=jsonb_set(dados,ARRAY[k],public.integracao_mesclar_json_seguro(p_anterior->k,p_dados->k,to_jsonb(atual)->k));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN RAISE EXCEPTION 'O negócio recebeu valores diferentes no campo %. Revise para continuar.',k USING ERRCODE='PT409'; END;
 END LOOP;
 -- Call the original validator even for an idempotent operation, preserving
 -- responsibility and active-account authorization without duplicating rules.
 RETURN public.integracao_crm_salvar_institucional(p_id,atual.versao,dados->>'nome',dados->>'contato',dados->>'produto',(dados->>'valor')::numeric,(dados->>'responsavel_id')::uuid,dados->>'status',dados->>'motivo_perda',NULL);
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='O negócio foi alterado. Reabra a ficha antes de salvar' THEN RAISE EXCEPTION 'O negócio mudou durante o salvamento.' USING ERRCODE='PT409'; END IF;
 RAISE;
END $$;
REVOKE ALL ON FUNCTION public.integracao_crm_institucional_conciliado(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_crm_institucional_conciliado(uuid,jsonb,jsonb) TO authenticated;
