import fs from 'node:fs';
const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8');
const atual = JSON.parse(ler('../fixtures/projetos-permissoes-producao-20261106.json'));
const anterior = JSON.parse(ler('../fixtures/permissoes-clientes-producao.json'));
const ident = value => '"' + value.replaceAll('"', '""') + '"';
export const idObservacoes = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const PERFIS_OBSERVACOES = Object.freeze({ projeto: idObservacoes(1), outro: idObservacoes(2), admin: idObservacoes(3), diretor: idObservacoes(4), consulta: idObservacoes(5), inativo: idObservacoes(6), comercial: idObservacoes(7) });

// Banco descartável de testes: somente perfis e moradores fictícios. As políticas
// e funções de autorização abaixo são lidas dos snapshots, sem versões permissivas.
export async function criarBancoObservacoes({ db, aplicarModulo = true, inserirDados = true } = {}) {
  if (!db) { const { PGlite } = await import(process.env.INTEGRACAO_PGLITE_MODULE || '@electric-sql/pglite'); db = new PGlite(); }
  await db.exec(`create role authenticated; create role anon;
    create schema auth; create schema integracao_crm_privado; create schema integracao_atribuicoes_privado;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key,nome text,tipo text,setor text,ativo boolean,updated_at timestamptz default now());
    create table public.fin_receb_clientes(id uuid primary key,nome text,ativo boolean,municipio_id uuid,codigo text);
    create table public.fin_receb_municipios(id uuid primary key,nome text,uf text);
    create table public.fin_receb_remessas(id uuid primary key,nome text);
    create table public.processos_kanban(id uuid primary key,nucleo text);
    create table public.integracao_crm_cards(id uuid primary key,cliente_id uuid);
    create table public.integracao_moradores(colecao text not null,registro_id text not null,dados jsonb not null default '{}',criado_por uuid,referencia_tabela text,referencia_id uuid,updated_at timestamptz default now(),primary key(colecao,registro_id));
    create table public.integracao_complementos(colecao text not null,registro_id text not null,dados jsonb not null default '{}',criado_por uuid,referencia_tabela text,referencia_id uuid,updated_at timestamptz default now(),primary key(colecao,registro_id));
    create table integracao_atribuicoes_privado.contratos(usuario_id uuid primary key,revisao_perfil text,regras jsonb);
    create table public.integracao_revisoes(modulo text primary key,versao bigint default 0);
    grant usage on schema public,auth,integracao_crm_privado,integracao_atribuicoes_privado to authenticated,anon;
    grant select on public.profiles,public.fin_receb_clientes,public.fin_receb_municipios,public.fin_receb_remessas,public.processos_kanban,public.integracao_crm_cards,public.integracao_moradores,public.integracao_complementos,public.integracao_revisoes to authenticated;
    alter table public.profiles enable row level security;
    create policy proprio on public.profiles for select to authenticated using(id=auth.uid());
    alter table public.integracao_moradores enable row level security;
    alter table public.integracao_complementos enable row level security;
    alter table public.fin_receb_clientes enable row level security;
    alter table public.integracao_revisoes enable row level security;
    create policy revisoes on public.integracao_revisoes for select to authenticated using(exists(select 1 from profiles where id=auth.uid() and ativo));
    insert into public.integracao_revisoes(modulo,versao) values('clientes',0);
  `);
  for (const tabela of ['metas', 'ordens_servico', 'planos_trabalho', 'erp_eventos', 'erp_conversas', 'meta_setores', 'erp_agendas']) {
    await db.exec(`create table public.${tabela}(id uuid primary key); grant select on public.${tabela} to authenticated;`);
  }
  for (const nome of ['is_admin','is_comercial','is_erp_admin','can_manage_core','can_access_fin_recebimentos','permite','integracao_acesso']) {
    const definicao = anterior.funcoes.find(f => f.nome === nome)?.sql;
    if (!definicao) throw Error(`Definição capturada ausente: ${nome}`);
    await db.exec(definicao);
  }
  // Política legada do arquivo versionado supabase/compartilhamento.sql.
  await db.exec('create policy integracao_ler on public.integracao_complementos for select to authenticated using(public.integracao_acesso(referencia_tabela,referencia_id,criado_por));');
  await db.exec(atual.guards.find(f => f.proname === 'escolha').definition);
  await db.exec(atual.privateFunctions.find(f => f.name === 'permitido').definition);
  for (const p of atual.policies.filter(p => ['integracao_moradores','fin_receb_clientes'].includes(p.tablename))) {
    await db.exec(`create policy ${ident(p.policyname)} on public.${ident(p.tablename)} as ${p.permissive} for ${p.cmd} to authenticated${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''}`);
  }
  await db.exec(`create function integracao_crm_privado.sinalizar_revisao() returns trigger language plpgsql security definer set search_path='' as $$begin
    update public.integracao_revisoes set versao=versao+1 where modulo=tg_argv[0];return null;
    end $$;
    revoke all on function integracao_crm_privado.sinalizar_revisao() from public,anon,authenticated;`);
  if (inserirDados) {
    const perfis = [
      [1,'Projetos','Projetos',true],[2,'Projetos','Projetos',true],[3,'Administrador','Diretoria',true],
      [4,'Diretor Técnico','Diretoria',true],[5,'Consulta','Consulta',true],[6,'Projetos','Projetos',false],[7,'Comercial','Comercial',true]
    ];
    for (const [n,tipo,setor,ativo] of perfis) {
      await db.query('insert into auth.users values($1)', [idObservacoes(n)]);
      await db.query('insert into profiles(id,nome,tipo,setor,ativo) values($1,$2,$3,$4,$5)', [idObservacoes(n), `${tipo} Teste ${n}`, tipo, setor, ativo]);
    }
    await db.query('insert into fin_receb_municipios values($1,$2,$3)',[idObservacoes(50),'Município fictício','SC']);
    await db.query('insert into fin_receb_clientes values($1,$2,$3,$4,$5),($6,$7,$8,$4,$9)', [idObservacoes(100),'Morador fictício',true,idObservacoes(50),'TST0001',idObservacoes(101),'Morador inativo fictício',false,'TST0002']);
    const antigos = { situacao: 'Ativo', observacoes: [{ id: 'antiga', texto: 'Observação geral preservada', controle: 'permanente' }] };
    for (const [chave,ref,dados] of [['privado',null,antigos],['compartilhado',idObservacoes(100),antigos],['inativo',idObservacoes(101),antigos],['arquivado',null,{ ...antigos, extras: { arquivamento: { ativo: true } } }]]) {
      await db.query('insert into integracao_moradores(colecao,registro_id,dados,criado_por,referencia_tabela,referencia_id) values($1,$2,$3,$4,$5,$6)', ['processos',chave,JSON.stringify(dados),idObservacoes(1),ref ? 'fin_receb_clientes' : null,ref]);
    }
  }
  if (aplicarModulo) await db.exec(ler('../../supabase/operacoes/documentos-observacoes-20261106.sql'));
  return db;
}

export async function loginObservacoes(db, usuario, role = 'authenticated') {
  if (!['authenticated','anon'].includes(role)) throw Error('Perfil de teste inválido');
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [usuario || '']); await db.exec(`set role ${role}`);
}
export async function rpcObservacoes(db, acao, processo, dados = {}) {
  return (await db.query('select public.integracao_documentos_observacoes_operar($1,$2,$3::jsonb) resultado',[acao,processo,JSON.stringify(dados)])).rows[0].resultado;
}
