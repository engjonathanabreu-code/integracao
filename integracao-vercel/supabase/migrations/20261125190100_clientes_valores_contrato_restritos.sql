-- EDI-C3 — PREPARADA, NÃO APLICADA. Aplicar somente com autorização explícita.
-- Os valores do contrato em fin_receb_clientes (valor_global, valor_entrada, numero_parcelas,
-- valor_parcela, primeiro_vencimento, dia_vencimento) passam a aceitar ALTERAÇÃO somente de
-- Diretoria, Comercial e Financeiro. Hoje a restrição existe só na tela; a política de edição
-- do cadastro deixa qualquer perfil ativo alterar essas colunas.
--
-- Como: gatilho BEFORE UPDATE que só age quando uma dessas colunas muda de valor. As demais
-- colunas (nome, documento, código, situação) seguem as políticas atuais. Não altera políticas,
-- concessões, leitura nem criação (INSERT) de clientes.
-- Rotinas sem papel de usuário (service_role, tarefas internas, editor SQL) não são afetadas.
--
-- CONFERIR NO BANCO DE DESTINO ANTES DE APLICAR (a tabela é do ERP e não é definida neste repositório):
--   1. as seis colunas existem com esses nomes (uma coluna ausente é ignorada pelo gatilho, não gera erro);
--   2. não há outro fluxo legítimo em que Topografia, Projetos, Pós-protocolo, Jurídico ou o setor de
--      consulta alterem esses valores com a própria sessão (ERP, CRM, importações);
--   3. não existe objeto com o mesmo nome da função ou do gatilho.
-- Reversão: supabase/operacoes/clientes-valores-contrato-restritos-reversao.sql

begin;

create function public.integracao_clientes_valores_contrato_restritos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes jsonb := to_jsonb(old);
  depois jsonb := to_jsonb(new);
  coluna text;
begin
  if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  foreach coluna in array array['valor_global','valor_entrada','numero_parcelas','valor_parcela','primeiro_vencimento','dia_vencimento'] loop
    if (depois -> coluna) is distinct from (antes -> coluna) then
      if not exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.ativo
          and (p.tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Comercial','Atendimentos')
            or lower(trim(coalesce(p.tipo,''))) = 'financeiro'
            or lower(trim(coalesce(p.setor,''))) = 'financeiro')
      ) then
        raise exception 'Somente Diretoria, Comercial e Financeiro podem alterar os valores do contrato do cliente.'
          using errcode = '42501';
      end if;
      return new;
    end if;
  end loop;
  return new;
end
$$;

revoke all on function public.integracao_clientes_valores_contrato_restritos() from public, anon, authenticated;

create trigger integracao_clientes_valores_contrato_restritos
  before update on public.fin_receb_clientes
  for each row execute function public.integracao_clientes_valores_contrato_restritos();

commit;
