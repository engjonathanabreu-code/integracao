BEGIN;
DO $teste$
DECLARE original jsonb; alterado jsonb; usado jsonb:='{"id":"teste-gerador-usado","nome":"Representante Fictício de Teste","ativo":true}'; livre jsonb:='{"id":"teste-gerador-livre","nome":"Representante Fictício Livre","ativo":true}'; bloqueou boolean:=false; mensagem text;
BEGIN
 SELECT dados INTO original FROM integracao_configuracoes WHERE colecao='config' AND registro_id='advogados';
 UPDATE integracao_configuracoes SET dados=jsonb_set(dados,'{valor}',dados->'valor'||jsonb_build_array(usado,livre)) WHERE colecao='config' AND registro_id='advogados';
 INSERT INTO integracao_moradores(colecao,registro_id,criado_por,dados) VALUES('processos','teste-gerador-historico',(SELECT criado_por FROM integracao_configuracoes WHERE colecao='config' AND registro_id='advogados'),jsonb_build_object('documentosGerados',jsonb_build_array(jsonb_build_object('id','teste-1','tipo','procuracao','representantes',jsonb_build_array(usado),'html','Procuração Fictícia'),jsonb_build_object('id','teste-2','tipo','procuracao','condicoes','para Representante Fictício de Teste'))));
 IF integracao_contar_procuracoes(usado)<>2 THEN RAISE EXCEPTION 'Contagem incorreta'; END IF;
 BEGIN
 UPDATE integracao_configuracoes SET dados=original WHERE colecao='config' AND registro_id='advogados';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS mensagem=MESSAGE_TEXT; bloqueou:=mensagem LIKE '%2 procurações%';
 END;
 IF NOT bloqueou THEN RAISE EXCEPTION 'Exclusão usada não foi bloqueada corretamente'; END IF;
 UPDATE integracao_configuracoes SET dados=jsonb_set(dados,'{valor}',original->'valor'||jsonb_build_array(usado||'{"ativo":false}'::jsonb)) WHERE colecao='config' AND registro_id='advogados';
 IF integracao_contar_procuracoes(usado)<>2 THEN RAISE EXCEPTION 'Histórico perdido após indisponibilidade'; END IF;
 bloqueou:=false;
 BEGIN
 UPDATE integracao_moradores SET dados=jsonb_set(dados,'{documentosGerados}',dados->'documentosGerados'||jsonb_build_array(jsonb_build_object('id','teste-3','tipo','procuracao','representantes',jsonb_build_array(usado)))) WHERE registro_id='teste-gerador-historico' AND colecao='processos';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS mensagem=MESSAGE_TEXT; bloqueou:=mensagem LIKE '%Representante indisponível%';
 END;
 IF NOT bloqueou THEN RAISE EXCEPTION 'Nova procuração com indisponível não foi bloqueada'; END IF;
END $teste$;
ROLLBACK;
SELECT 'PASSOU: usado bloqueado com contagem 2; livre excluído; indisponível preserva histórico; nova emissão indisponível bloqueada; teste revertido' resultado;
