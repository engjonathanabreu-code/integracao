import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {permissoes,setorDoPerfilERP} from '../src/permissoes.js';
import {projetar} from '../src/dados-compartilhados.js';
import {fixture,blank,id} from './fixture.js';

const ler=caminho=>fs.readFileSync(new URL(caminho,import.meta.url),'utf8');
// Perfis do ERP e o que valia antes de EDI-C1 (todo perfil ativo editava a ficha).
const perfis=[
 ['Administrador','diretoria',true],['Diretor Técnico','diretoria',true],['Diretor de Projetos','diretoria',true],
 ['Comercial','comercial',true],['Atendimentos','comercial',true],['Financeiro','financeiro',true],['Topografia','topografia',true],
 ['Projetos','projeto',true],['Jurídico','juridico',true],['Pós-protocolo','posprotocolo',true],
 ['Marketing','consulta',false],['Administrativo','consulta',false],['Consulta','consulta',false],
];
const usuarioDoTipo=(tipo,setor=tipo,ativo=true)=>{
 const b=fixture();Object.assign(b.profiles[0],{tipo,setor,ativo});return projetar(b,blank()).db.usuarios[0];
};

test('EDI-C1: perfis antes/depois — só o setor de consulta perde a edição da ficha',()=>{
 const tabela=perfis.map(([tipo,setor,depois])=>{const u=usuarioDoTipo(tipo);return {tipo,setor:u.setor,antes:true,depois:permissoes(u).editarClientes,esperado:depois,setorEsperado:setor};});
 for(const l of tabela){assert.equal(l.setor,l.setorEsperado,l.tipo);assert.equal(l.depois,l.esperado,l.tipo);}
 assert.deepEqual(tabela.filter(l=>l.antes!==l.depois).map(l=>l.tipo),['Marketing','Administrativo','Consulta']);
 // Financeiro identificado só pelo setor do cadastro continua editando.
 assert.equal(permissoes(usuarioDoTipo('Marketing','Financeiro')).editarClientes,true);
 // Usuário manual do setor consulta e usuário sem setor.
 assert.equal(permissoes({id:'u6',setor:'consulta',ativo:true}).editarClientes,false);
 assert.equal(permissoes({id:'x',ativo:true}).editarClientes,false);
 for(const u of [null,{setor:'comercial',ativo:false},{setor:'consulta',ativo:false}])assert.equal(permissoes(u).editarClientes,false);
});

test('EDI-C1: consulta mantém o restante do perfil e os outros setores não mudam',()=>{
 const consulta=permissoes(usuarioDoTipo('Consulta'));
 // Nada além de editarClientes foi alterado para o setor de consulta.
 assert.deepEqual({editarEstrutura:consulta.editarEstrutura,criarNucleosRemessas:consulta.criarNucleosRemessas,criarMoradores:consulta.criarMoradores,campoOffline:consulta.campoOffline,verCPF:consulta.verCPF,cadastro:consulta.cadastro,social:consulta.social,imovel:consulta.imovel},
  {editarEstrutura:true,criarNucleosRemessas:true,criarMoradores:true,campoOffline:true,verCPF:false,cadastro:false,social:false,imovel:false});
 const anteriores=JSON.parse(ler('./permissoes-anteriores.json'));
 for(const [setor,esperado] of Object.entries(anteriores)){
  const p=permissoes({id:'u',setor,ativo:true});
  for(const [chave,valor] of Object.entries(esperado)){
   if(typeof valor==='object'&&valor){for(const [k,v] of Object.entries(valor))assert.equal(p[chave](k),v,`${setor}.${chave}(${k})`);}
   else assert.equal(p[chave],valor,`${setor}.${chave}`);
  }
 }
});

test('EDI-C1: a ficha decide edição por editarClientes ou pela permissão da seção; leitura não depende dela',()=>{
 const app=ler('../src/App.jsx');
 const usos=app.split('\n').filter(l=>l.includes('perm.editarClientes'));
 assert.ok(usos.length>=6);
 // Todo uso é um portão de edição (habilitar campo, enviar, salvar código, estrutura de unidades) ou o aviso de somente leitura.
 for(const l of usos)assert.match(l,/const pode = |const dis = |podeEnviar|podeSecao|permissão para editar o código|podeEstrutura|não altera dados/,l.trim().slice(0,120));
 assert.match(app,/Seu perfil consulta o cadastro, mas não altera dados\./);
});

test('EDI-C1: migration preparada bloqueia o setor de consulta no banco, mantém leitura e é reversível',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role authenticated;create role anon;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table profiles(id uuid primary key,tipo text,setor text,ativo boolean);
  create table fin_receb_clientes(id uuid primary key,nome text);
  create table fin_receb_municipios(id uuid primary key,nome text);
  create table fin_receb_remessas(id uuid primary key,nome text);
  grant usage on schema auth to authenticated,anon;
  grant select,insert,update,delete on all tables in schema public to authenticated;
  insert into profiles values('${id(1)}','Comercial','Comercial',true);
  insert into fin_receb_clientes values('${id(4)}','Morador fictício');
  alter table fin_receb_clientes enable row level security;alter table fin_receb_municipios enable row level security;alter table fin_receb_remessas enable row level security;
  create policy leitura_ativos on fin_receb_clientes for select to authenticated using (exists(select 1 from profiles where id=auth.uid() and ativo));`);
  await db.exec(ler('../supabase/migrations/20260928125709_clientes_edicao_todos_setores.sql'));
  const como=async(tipo,setor=tipo,ativo=true)=>{await db.exec('reset role');await db.query('update profiles set tipo=$1,setor=$2,ativo=$3',[tipo,setor,ativo]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);await db.exec('set role authenticated');};
  const edita=async()=>(await db.query("update fin_receb_clientes set nome=nome||'.' where id=$1 returning id",[id(4)])).rows.length===1;
  const le=async()=>(await db.query('select id from fin_receb_clientes')).rows.length===1;
  for(const [tipo] of perfis){await como(tipo);assert.equal(await edita(),true,'antes: '+tipo);}
  await db.exec('reset role');await db.exec(ler('../supabase/migrations/20261125190000_clientes_edicao_sem_perfil_consulta.sql'));
  for(const [tipo,,depois] of perfis){
   await como(tipo);
   assert.equal(await edita(),depois,'depois: '+tipo);
   assert.equal(await edita(),permissoes(usuarioDoTipo(tipo)).editarClientes,'tela e banco iguais: '+tipo);
   assert.equal(await le(),true,'leitura preservada: '+tipo);
   await como(tipo,tipo,false);assert.equal(await edita(),false,'inativo: '+tipo);
  }
  await como('Marketing','Financeiro');assert.equal(await edita(),true,'financeiro pelo setor');
  assert.equal(setorDoPerfilERP({tipo:'Marketing',setor:'Financeiro'},{}),'financeiro');
  await db.exec('reset role');await db.exec(ler('../supabase/operacoes/clientes-edicao-sem-perfil-consulta-reversao.sql'));
  for(const [tipo] of perfis){await como(tipo);assert.equal(await edita(),true,'revertido: '+tipo);}
 }finally{await db.close();}
});
