-- Desativa somente a projeção. Nenhum registro de usuário ou evento é removido.
begin;
drop function if exists public.integracao_viagens_financeiro();
drop function if exists integracao_viagens_privado.listar();
drop function if exists integracao_viagens_privado.data_civil(text);
-- Não usar CASCADE nem remover o schema: preservar possíveis objetos futuros.
commit;
