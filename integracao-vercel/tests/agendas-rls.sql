BEGIN;
SELECT set_config('test.admin',(SELECT id::text FROM public.profiles WHERE ativo AND tipo='Administrador' LIMIT 1),true);
SELECT set_config('test.usuario',(SELECT id::text FROM public.profiles WHERE ativo AND tipo='Topografia' LIMIT 1),true);
SELECT set_config('test.diretor',(SELECT id::text FROM public.profiles WHERE ativo AND tipo IN ('Diretor Técnico','Diretor de Projetos','Diretor de Projeto') LIMIT 1),true);
SELECT set_config('test.agenda',gen_random_uuid()::text,true),set_config('test.privado',gen_random_uuid()::text,true),set_config('test.compartilhado',gen_random_uuid()::text,true);
INSERT INTO public.erp_agendas(id,nome,cor,created_by) VALUES(current_setting('test.agenda')::uuid,'Agenda de verificação','#123456',current_setting('test.admin')::uuid);
INSERT INTO public.erp_eventos(serie_id,id,titulo,inicio,fim,publico,created_by,participantes,agenda_id) VALUES
(gen_random_uuid(),current_setting('test.privado')::uuid,'Pessoal de outra conta','2199-01-01T10:00Z','2199-01-01T11:00Z',true,current_setting('test.admin')::uuid,'{}',null),
(gen_random_uuid(),current_setting('test.compartilhado')::uuid,'Reserva de ativo','2199-01-01T10:00Z','2199-01-01T11:00Z',true,current_setting('test.admin')::uuid,'{}',current_setting('test.agenda')::uuid);
SELECT set_config('request.jwt.claim.sub',current_setting('test.usuario'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.integracao_eventos() WHERE id=current_setting('test.privado')::uuid) THEN RAISE EXCEPTION 'Compromisso alheio exposto'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.integracao_eventos() WHERE id=current_setting('test.compartilhado')::uuid) THEN RAISE EXCEPTION 'Agenda compartilhada indisponível'; END IF;
 UPDATE public.erp_agendas SET nome='Não autorizado' WHERE id=current_setting('test.agenda')::uuid;
 IF FOUND THEN RAISE EXCEPTION 'Usuário comum editou agenda'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('test.diretor'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.integracao_eventos() WHERE id=current_setting('test.privado')::uuid) THEN RAISE EXCEPTION 'Diretor não viu todos os eventos'; END IF;
 PERFORM public.integracao_gravar(jsonb_build_array(jsonb_build_object('table','erp_agendas','key',jsonb_build_object('id',current_setting('test.agenda')),'expected',jsonb_build_object('nome','Agenda de verificação','cor','#123456'),'changes',jsonb_build_object('nome','Agenda editada','cor','#654321'))));
 IF NOT EXISTS(SELECT 1 FROM public.erp_agendas WHERE id=current_setting('test.agenda')::uuid AND nome='Agenda editada' AND cor='#654321') THEN RAISE EXCEPTION 'Edição da agenda não persistiu'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS: usuário comum vê somente próprios/compartilhados; diretor vê todos e edita nome/cor; teste revertido' resultado;
ROLLBACK;
