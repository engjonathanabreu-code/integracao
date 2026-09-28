-- Incident 2026-09-28: business conflicts raised as 40001 caused PostgREST 14
-- to retry transactions continuously and exhaust connections.
-- Change only the conflict SQLSTATE; keep checks, permissions and all rows intact.
-- Applied to production at ~15:20:49 UTC. Chat and customer conflict probes
-- returned PT409 before any write; test transaction was rolled back.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
DO $fix$
DECLARE original text; corrected text;
BEGIN
  SELECT pg_get_functiondef('public.integracao_gravar(jsonb,uuid)'::regprocedure)
    INTO original;
  IF position('ERRCODE=''PT409''' in original)>0
     AND position('ERRCODE=''40001''' in original)=0 THEN
    RETURN; -- Already applied by the incident hotfix.
  END IF;
  IF md5(original)<>'5f43cd1a5f79f6cb02ac360701825c39' THEN
    RAISE EXCEPTION 'integracao_gravar changed: review before applying conflict fix';
  END IF;
  corrected:=replace(original,'ERRCODE=''40001''','ERRCODE=''PT409''');
  IF corrected=original THEN RAISE EXCEPTION 'Expected conflict clause absent'; END IF;
  EXECUTE corrected;
END $fix$;
