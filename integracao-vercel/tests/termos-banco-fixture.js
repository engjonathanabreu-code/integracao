import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const uuidTermoTeste = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const idsTermos = { admin: uuidTermoTeste(1), projetos: uuidTermoTeste(2), financeiro: uuidTermoTeste(3), externo: uuidTermoTeste(4), inativo: uuidTermoTeste(5), municipioA: uuidTermoTeste(101), municipioB: uuidTermoTeste(102), nucleoA: uuidTermoTeste(201), nucleoB: uuidTermoTeste(202), clienteA: uuidTermoTeste(301), clienteB: uuidTermoTeste(302), processoA: 'morador_a', processoB: 'morador_b', unidadeA: 'unidade-a', unidadeB: 'unidade-b' };
export const sqlTermos = readFileSync(new URL('../supabase/operacoes/termos-municipais-20261106.sql', import.meta.url), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('./fixtures/projetos-permissoes-producao-20261106.json', import.meta.url), 'utf8'));

export async function criarBancoTermosTeste({ aplicar = true } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
  create table profiles(id uuid primary key,nome text,tipo text,setor text,ativo boolean);
  create table fin_receb_municipios(id uuid primary key,nome text,uf text,prefixo text);
  create table test_scope(perfil uuid,municipio uuid);
  grant select on profiles,fin_receb_municipios,test_scope to authenticated;
  create function test_pode_municipio(chave uuid) returns boolean language sql stable as $$select exists(select 1 from public.test_scope where perfil=auth.uid() and municipio=chave)$$;
  create function is_erp_admin() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;
  alter table profiles enable row level security;create policy ler on profiles for select to authenticated using(id=auth.uid());
  alter table fin_receb_municipios enable row level security;create policy ler on fin_receb_municipios for select to authenticated using(test_pode_municipio(id));`);
  // Os tipos/colunas destes quatro registros são os capturados da produção em 06/11.
  for (const tabela of ['fin_receb_clientes', 'processos_kanban', 'integracao_moradores', 'integracao_nucleos']) {
    const cols = snapshot.columns.filter(x => x.table === tabela).map(x => `"${x.column}" ${x.type}`).join(',');
    await db.exec(`create table public.${tabela}(${cols});alter table public.${tabela} enable row level security;grant select on public.${tabela} to authenticated;`);
  }
  await db.exec(`alter table fin_receb_clientes add primary key(id);alter table processos_kanban add primary key(id);
  alter table integracao_moradores add primary key(colecao,registro_id);alter table integracao_nucleos add primary key(colecao,registro_id);
  create table integracao_complementos(like integracao_moradores including all);alter table integracao_complementos enable row level security;grant select on integracao_complementos to authenticated;
  create policy ler on fin_receb_clientes for select to authenticated using(test_pode_municipio(municipio_id));
  create policy ler on processos_kanban for select to authenticated using(exists(select 1 from fin_receb_municipios m where m.nome=municipio and m.uf=estado));
  create function integracao_acesso(tabela text,registro uuid,dono uuid) returns boolean language plpgsql stable set search_path='' as $$declare permitido boolean;begin
   if not exists(select 1 from public.profiles where id=auth.uid() and ativo) then return false;end if;
   if tabela='integracao_config' then return true;end if;
   if tabela is null then return dono=auth.uid() or public.is_erp_admin();end if;
   if tabela not in ('processos_kanban','metas','ordens_servico','planos_trabalho','erp_eventos','erp_conversas','profiles','fin_receb_municipios','fin_receb_remessas','fin_receb_clientes','meta_setores','erp_agendas') then return false;end if;
   execute format('select exists(select 1 from public.%I where id=$1)',tabela) into permitido using registro;return permitido;
  end$$;
  create policy ler on integracao_moradores for select to authenticated using(integracao_acesso(referencia_tabela,referencia_id,criado_por));
  create policy ler on integracao_nucleos for select to authenticated using(integracao_acesso(referencia_tabela,referencia_id,criado_por));
  create policy ler on integracao_complementos for select to authenticated using(integracao_acesso(referencia_tabela,referencia_id,criado_por));`);
  // UPDATE segue a política de produção; o guard de mutação abaixo é o snapshot
  // real. Apenas a seleção do contrato é parametrizada para testar aceitar/negar.
  await db.exec(`create function can_manage_core() returns boolean language sql stable as $$select public.is_erp_admin() or exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Comercial')$$;
  grant update(dados,updated_at) on integracao_moradores,integracao_complementos to authenticated;
  create schema integracao_atribuicoes_privado;
  create function integracao_atribuicoes_privado.contratado() returns boolean language sql stable as $$select true$$;
  create function integracao_atribuicoes_privado.permitido(text,text,boolean default true) returns boolean language sql stable as $$select coalesce(current_setting('test.deny_update',true),'false')<>'true'$$;`);
  const editar = snapshot.policies.find(p => p.tablename === 'integracao_moradores' && p.cmd === 'UPDATE');
  for (const tabela of ['integracao_moradores', 'integracao_complementos']) {
    await db.exec(`create policy editar on public.${tabela} for update to authenticated using(${editar.qual}) with check(${editar.with_check});`);
  }
  await db.exec(snapshot.guards.find(f => f.proname === 'proteger_mutacao').definition);
  await db.exec(`create trigger contrato before update on integracao_moradores for each row execute function integracao_atribuicoes_privado.proteger_mutacao('clientes');
  create trigger contrato before update on integracao_complementos for each row execute function integracao_atribuicoes_privado.proteger_mutacao('clientes');`);
  const i = idsTermos;
  for (const [id, tipo, ativo] of [[i.admin, 'Administrador', true], [i.projetos, 'Projetos', true], [i.financeiro, 'Financeiro', true], [i.externo, 'Projetos', true], [i.inativo, 'Projetos', false]]) {
    await db.query('insert into profiles values($1,$2,$3,$3,$4)', [id, `Perfil fictício ${tipo}`, tipo, ativo]);
    await db.query('insert into test_scope values($1,$2)', [id, id === i.externo ? i.municipioB : i.municipioA]);
  }
  await db.query('insert into test_scope values($1,$2)', [i.admin, i.municipioB]);
  for (const [sufixo, mun, nucleo, cliente, processo, unidade] of [['A', i.municipioA, i.nucleoA, i.clienteA, i.processoA, i.unidadeA], ['B', i.municipioB, i.nucleoB, i.clienteB, i.processoB, i.unidadeB]]) {
    await db.query('insert into fin_receb_municipios values($1,$2,$3,$4)', [mun, `Município Teste ${sufixo}`, 'SC', `T${sufixo}`]);
    await db.query('insert into processos_kanban(id,municipio,estado,nucleo) values($1,$2,$3,$4)', [nucleo, `Município Teste ${sufixo}`, 'SC', `Núcleo ${sufixo}`]);
    await db.query('insert into integracao_nucleos(colecao,registro_id,dados,criado_por,referencia_tabela,referencia_id) values($1,$2,$3,$4,$5,$6)', ['nucleos', `nucleo_${sufixo.toLowerCase()}`, { municipioId: mun, codigo: `NUI-${sufixo}` }, i.admin, 'processos_kanban', nucleo]);
    await db.query('insert into fin_receb_clientes(id,municipio_id,codigo,nome,cpf_cnpj,ativo) values($1,$2,$3,$4,$5,true)', [cliente, mun, `TESTE-${sufixo}`, `Morador Canônico ${sufixo}`, '52998224725']);
    await db.query('insert into integracao_moradores(colecao,registro_id,dados,criado_por,referencia_tabela,referencia_id) values($1,$2,$3,$4,$5,$6)', ['processos', processo, { municipioId: mun, nucleoId: `nucleo_${sufixo.toLowerCase()}`, requerente: { nome: 'Nome antigo no complemento', cpf: '11111111111', estadoCivil: 'Casado(a)', nacionalidade: 'Brasileira' }, conjuge: { nome: 'Cônjuge fictício', cpf: '11144477735' }, endereco: { logradouro: 'Rua Teste', numero: '1', municipio: `Município Teste ${sufixo}`, uf: 'SC' }, qualificacao: { textos: { completa: 'Qualificação fictícia salva.' }, origem: { completa: 'gerada' } }, unidades: [{ id: unidade, area: '123,0450', loteQuadra: 'Q1 L2' }], social: { modalidade: 'REURB-S' } }, i.admin, 'fin_receb_clientes', cliente]);
  }
  if (aplicar) await db.exec(sqlTermos);
  return db;
}

export async function autenticarTermoTeste(db, usuario = idsTermos.projetos) {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [usuario]);
  await db.exec('set role authenticated');
}
export async function operarTermoTeste(db, acao, dados) {
  return (await db.query('select public.integracao_termos_operar($1,$2::jsonb) resultado', [acao, JSON.stringify(dados)])).rows[0].resultado;
}
