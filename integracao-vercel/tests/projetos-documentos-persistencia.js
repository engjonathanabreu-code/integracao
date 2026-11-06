import { readFileSync } from 'node:fs';
const ler = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const snapshot = JSON.parse(ler('./fixtures/projetos-permissoes-producao-20261106.json'));

// Completa exclusivamente o PGlite descartável do harness. A RPC é a versão
// capturada + migrações versionadas de reconciliação; não simula gravações.
export async function instalarPersistenciaProjetos(db) {
  await db.exec(`alter table profiles add column updated_at timestamptz default now();
    create table integracao_atribuicoes_privado.contratos(usuario_id uuid primary key,revisao_perfil text,regras jsonb);
    create table integracao_pedidos(usuario_id uuid not null,pedido uuid not null,resumo text not null,resultado jsonb not null,criado_em timestamptz default now(),primary key(usuario_id,pedido));
    alter table integracao_pedidos enable row level security;
    create policy proprio on integracao_pedidos to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());
    grant select,insert on integracao_pedidos to authenticated;
    grant update(dados,updated_at) on integracao_nucleos to authenticated;
    create table integracao_auditoria(like integracao_moradores including all);
    alter table integracao_auditoria enable row level security;
    grant select,insert on integracao_auditoria to authenticated;
    create policy ler on integracao_auditoria for select to authenticated using(integracao_acesso(referencia_tabela,referencia_id,criado_por));
    create policy criar on integracao_auditoria for insert to authenticated with check(criado_por=auth.uid() and integracao_acesso(referencia_tabela,referencia_id,criado_por));
    create schema storage;create table storage.objects(bucket_id text,name text);`);
  await db.exec(snapshot.guards.find(f => f.proname === 'escolha').definition);
  const contratos = ler('../supabase/migrations/20261014113728_atribuicoes_contrato_especifico.sql');
  const validarNucleo = contratos.match(/create function integracao_atribuicoes_privado\.validar_nucleo\([\s\S]*?end \$\$;/)?.[0];
  if (!validarNucleo) throw Error('Guard versionado de etapa do núcleo ausente');
  await db.exec(validarNucleo);
  const editar = snapshot.policies.find(p => p.tablename === 'integracao_nucleos' && p.cmd === 'UPDATE');
  await db.exec(`create policy editar on integracao_nucleos for update to authenticated using(${editar.qual}) with check(${editar.with_check});
    create trigger contrato before insert or update or delete on integracao_nucleos for each row execute function integracao_atribuicoes_privado.proteger_mutacao('nucleos');`);
  for (const arquivo of ['./fixtures/gravar-antes-leitura.sql', '../supabase/migrations/20260928161356_chat_leitura_sem_conflito.sql', '../supabase/migrations/20260928164241_notificacoes_leitura_sem_conflito.sql', '../supabase/migrations/20260929145521_moradores_mesclagem_sem_conflito.sql', '../supabase/migrations/20260929162047_modulos_mesclagem_sem_conflito.sql', '../supabase/migrations/20260930133924_concorrencia_global_segura.sql']) await db.exec(ler(arquivo));
  await db.exec(`revoke all on function public.integracao_gravar(jsonb,uuid) from public,anon;grant execute on function public.integracao_gravar(jsonb,uuid) to authenticated;`);
  await db.exec(ler('../supabase/operacoes/oficios.sql').split('do $$declare')[0].replace(/^begin;\s*/, ''));
  await db.exec(snapshot.privateFunctions.find(f => f.name === 'pode_editar_oficios').definition);
  await db.exec(ler('../supabase/operacoes/projetos-geometria-codigos.sql'));
  await db.exec(`create trigger qa_nucleos_revisao after insert or update or delete on integracao_nucleos for each statement execute function integracao_crm_privado.sinalizar_revisao('clientes');
    create trigger qa_moradores_revisao after insert or update or delete on integracao_moradores for each statement execute function integracao_crm_privado.sinalizar_revisao('clientes');`);
}

export async function gravarProjetos(db, operacoes, pedido = crypto.randomUUID()) {
  return (await db.query('select public.integracao_gravar($1::jsonb,$2::uuid) resultado', [JSON.stringify(operacoes), pedido])).rows[0].resultado;
}
