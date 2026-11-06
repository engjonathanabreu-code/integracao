-- Reversão funcional conservadora, NÃO EXECUTADA. Requer revisão operacional.
-- Use junto de uma interface de contingência que interrompa novas emissões,
-- mantenha leitura dos dados novos e permita consumir reservas já emitidas.
-- Não restaure a função antiga oficio_registrar_v1 enquanto houver reservas.
-- Não restaure um backup por cima do banco atual: isso perderia gravações novas.
begin;

-- Interrompe somente a criação de novas reservas. Mantém consulta e consumo,
-- documentos existentes, sequência vigente e números reservados sem reciclar.
revoke execute on function public.integracao_oficio_reservar_numero(uuid,integer,integer) from authenticated;
revoke execute on function integracao_projetos_privado.reservar_oficio(uuid,integer,integer) from authenticated;

-- Retorna apenas as novas capacidades ao conjunto anterior. Os controles de
-- integridade, RLS, contratos, validação geográfica e proteção de código ficam.
create or replace function integracao_projetos_privado.permite(acao text)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo and
   case acao
    when 'mapa' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia','Comercial','Atendimentos')
    when 'geometria' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia')
    when 'memorial_nucleo' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia')
    when 'area_unidade' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia')
    when 'lote_quadra' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Projetos','Projeto')
    when 'memorial_unidade' then p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Diretor de Projeto','Topografia')
    else false end)
$$;
notify pgrst,'reload schema';
commit;

-- Retomada: reaplicar apenas a definição permite() e os dois GRANT EXECUTE da
-- operação original por migração revisada. Nunca repetir CREATE TABLE, decrementar
-- integracao_oficios_sequencias.ultimo, apagar reservas ou reutilizar seus números.
