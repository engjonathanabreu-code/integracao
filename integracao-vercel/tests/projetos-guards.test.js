import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/operacoes/projetos-geometria-codigos.sql',import.meta.url),'utf8');
const reversao=readFileSync(new URL('../supabase/operacoes/reversao-projetos-geometria-codigos.sql',import.meta.url),'utf8');
const oficiosDDL=readFileSync(new URL('../supabase/operacoes/oficios.sql',import.meta.url),'utf8').split('do $$declare')[0].replace(/^begin;\s*/,'');
const snapshot=JSON.parse(readFileSync(new URL('./fixtures/projetos-permissoes-producao-20261106.json',import.meta.url),'utf8'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.profiles(id uuid primary key,tipo text,setor text,ativo boolean);
 create table public.fin_receb_clientes(id uuid primary key,codigo text,nome text);
 create table public.integracao_nucleos(colecao text,registro_id text primary key,dados jsonb,referencia_id uuid);
 create table public.integracao_moradores(colecao text,registro_id text primary key,dados jsonb,referencia_id uuid);
 create table public.integracao_complementos(colecao text,registro_id text primary key,dados jsonb,referencia_id uuid);
 grant select on profiles to authenticated;
 grant select,insert,update on fin_receb_clientes,integracao_nucleos,integracao_moradores,integracao_complementos to authenticated;
 insert into profiles values('${id(1)}','Projetos','Projetos',true),('${id(2)}','Topografia','Topografia',true),('${id(3)}','Comercial','Comercial',true),('${id(4)}','Marketing','Marketing',true),('${id(5)}','Administrador','Administrador',true),('${id(6)}','Projetos','Projetos',false),('${id(7)}','Topografia','Projetos',true),('${id(8)}','Marketing','Projetos',true);
 insert into fin_receb_clientes values('${id(101)}','FIC01_001','Cadastro A'),('${id(102)}','FIC01_001','Legado B');
 insert into integracao_nucleos values('nucleos','n1','{"etapa":0,"checks":{},"memorial":{"texto":"Anterior"}}',null);
 insert into integracao_moradores values('processos','p1','{"etapa":0,"nucleoId":"n1","unidades":[{"id":"u1","area":"100,25","loteQuadra":"Lote 1, Quadra A","memorial":"Texto técnico anterior"},{"id":"u2","area":"90","memorial":"Outro texto"}]}','${id(101)}');
 alter table integracao_nucleos enable row level security;
 create policy escopo on integracao_nucleos for all to authenticated using(registro_id='n1') with check(registro_id='n1');`);
 await db.exec('create schema storage;create table storage.objects(bucket_id text,name text);create schema integracao_crm_privado;grant usage on schema integracao_crm_privado to authenticated;');
 await db.exec(oficiosDDL);
 await db.exec(snapshot.privateFunctions.find(f=>f.name==='pode_editar_oficios').definition);
 await db.exec(sql);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',false);`);
 return db;
}
test('guarda permite Projetos antes de Topografia e preserva escopo e memorial individual',async()=>{
 const db=await fixture();try{
 const antes=(await db.query("select dados from integracao_moradores where registro_id='p1'")).rows[0].dados;
 await db.query("update integracao_nucleos set dados=dados||$1::jsonb where registro_id='n1'",[JSON.stringify({geo:{poligonos:[]},levantamentoGeoJSON:{feicoes:[]},memorial:{texto:'Novo núcleo'}})]);
 await db.query("update integracao_moradores set dados=jsonb_set(dados,'{unidades,0,area}','\"101,75\"') where registro_id='p1'");
 const depois=(await db.query("select dados from integracao_moradores where registro_id='p1'")).rows[0].dados;
 assert.equal(depois.unidades[0].area,'101,75');assert.equal(depois.unidades[0].memorial,antes.unidades[0].memorial);assert.deepEqual(depois.unidades[1],antes.unidades[1]);assert.equal(depois.etapa,0);
 await assert.rejects(db.query("update integracao_moradores set dados=jsonb_set(dados,'{unidades,0,memorial}','\"Troca proibida\"') where registro_id='p1'"),/memorial técnico/);
 await assert.rejects(db.query("insert into integracao_nucleos values('nucleos','fora','{}',null)"),/row-level security/);
 await db.exec(`select set_config('request.jwt.claim.sub','${id(4)}',false);`);
 await assert.rejects(db.query("update integracao_nucleos set dados=jsonb_set(dados,'{memorial,texto}','\"Ataque\"') where registro_id='n1'"),/Sem permissão/);
 await db.exec(`select set_config('request.jwt.claim.sub','${id(2)}',false);`);
 await db.query("update integracao_moradores set dados=jsonb_set(dados,'{unidades,0,memorial}','\"Topografia autorizada\"') where registro_id='p1'");
 await db.exec(`select set_config('request.jwt.claim.sub','${id(6)}',false);`);
 await assert.rejects(db.query("update integracao_nucleos set dados=jsonb_set(dados,'{memorial,texto}','\"Inativo\"') where registro_id='n1'"),/Sessão ativa/);
 }finally{await db.close();}
});

test('setor canônico Projetos libera capacidades específicas sem conceder memorial individual',async()=>{
 const db=await fixture();try{
 for(const n of [7,8]){
  await db.exec(`select set_config('request.jwt.claim.sub','${id(n)}',false);`);
  for(const acao of ['mapa','geometria','memorial_nucleo','area_unidade','lote_quadra'])assert.equal((await db.query('select integracao_projetos_privado.permite($1) p',[acao])).rows[0].p,true,acao);
  assert.equal((await db.query("select integracao_projetos_privado.permite('memorial_unidade') p")).rows[0].p,n===7,'Topografia mantém acesso anterior; outro tipo não recebe acesso técnico');
 }
 await db.query("update integracao_moradores set dados=jsonb_set(dados,'{unidades,0,loteQuadra}','\"Lote 2, Quadra A\"') where registro_id='p1'");
 await assert.rejects(db.query("update integracao_moradores set dados=jsonb_set(dados,'{unidades,0,memorial}','\"Proibido\"') where registro_id='p1'"),/memorial técnico/);
 }finally{await db.close();}
});

test('API rejeita GeoJSON novo inválido e preserva levantamento UTM legado inalterado',async()=>{
 const db=await fixture();try{
 const anel=[[-49,-27],[-48.999,-27],[-48.999,-26.999],[-49,-27]];
 const geometria={type:'Polygon',coordinates:[anel]};
 const collection=g=>({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:g}]});
 const gravarGeo=g=>db.query("update integracao_nucleos set dados=jsonb_set(dados,'{geo}',$1::jsonb) where registro_id='n1'",[JSON.stringify({geojson:collection(g),poligonos:[anel]})]);
 await gravarGeo(geometria);
 for(const g of [{type:'Point',coordinates:[-49,-27]},{type:'Polygon',coordinates:[[[500000,7000000],[500001,7000000],[500001,7000001],[500000,7000000]]]},{type:'Polygon',coordinates:[[['-49',-27],...anel.slice(1)]]},{type:'Polygon',coordinates:[anel.slice(0,-1)]},{...geometria,crs:{}}])await assert.rejects(gravarGeo(g),/geometri|Coordenada|coordenada|contorno|longitude|Polygon/);
 assert.deepEqual((await db.query("select dados#>'{geo,geojson,features,0,geometry}' g from integracao_nucleos where registro_id='n1'")).rows[0].g,geometria);
 const pacote={epsg:4326,feicoes:[{id:'f1',geometria,poligono:anel.slice(0,-1),coordenadasGeograficas:true}]};
 await db.query("update integracao_nucleos set dados=jsonb_set(dados,'{levantamentoGeoJSON}',$1::jsonb) where registro_id='n1'",[JSON.stringify(pacote)]);
 const ruim=structuredClone(pacote);ruim.feicoes[0].geometria.type='LineString';
 await assert.rejects(db.query("update integracao_nucleos set dados=jsonb_set(dados,'{levantamentoGeoJSON}',$1::jsonb) where registro_id='n1'",[JSON.stringify(ruim)]),/Polygon/);
 // Semeia somente a fixture isolada: um formato histórico não é saneado nem bloqueia edição de outro campo.
 const legado={epsg:31982,feicoes:[{id:'legado',vertices:[{e:500000,n:7000000}],poligono:[[500000,7000000],[500001,7000000],[500000,7000001]]}]};
 await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);");
 await db.query("update integracao_nucleos set dados=jsonb_set(dados,'{levantamentoGeoJSON}',$1::jsonb) where registro_id='n1'",[JSON.stringify(legado)]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id(1)}',false);`);
 await db.query("update integracao_nucleos set dados=jsonb_set(dados,'{memorial,texto}','\"Somente memorial\"') where registro_id='n1'");
 assert.deepEqual((await db.query("select dados->'levantamentoGeoJSON' g from integracao_nucleos where registro_id='n1'")).rows[0].g,legado);
 }finally{await db.close();}
});

test('reservas de ofícios são atômicas e idempotentes, sem registro de envio',async()=>{
 const db=await fixture();try{
 const reservar=(pedido,ano=2025)=>db.query('select integracao_oficio_reservar_numero($1,$2,$3) r',[id(pedido),ano,41]);
 const primeiro=(await reservar(201)).rows[0].r;
 assert.equal(primeiro.numero,41);assert.deepEqual((await reservar(201)).rows[0].r,primeiro);
 const outros=await Promise.all([reservar(202),reservar(203)]);
 assert.deepEqual(outros.map(r=>r.rows[0].r.numero).sort(),[42,43]);
 assert.equal((await db.query('select * from integracao_oficios_reservas')).rows.length,3);
 await assert.rejects(db.query('delete from integracao_oficios_reservas'),/permission denied/);
 await db.exec('reset role;');assert.equal((await db.query('select count(*)::int n from integracao_oficios')).rows[0].n,0);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id(6)}',false);`);
 await assert.rejects(reservar(204),/Sessão ativa/);
 await db.exec(`select set_config('request.jwt.claim.sub','${id(4)}',false);`);
 assert.equal((await db.query('select * from integracao_oficios_reservas')).rows.length,0);
 assert.equal((await reservar(205)).rows[0].r.numero,44,'Marketing gera sem receber permissão de registrar envio');
 await assert.rejects(db.query("select integracao_crm_privado.oficio_registrar_v1('registrar','{}')"),/Sem permissão/);
 }finally{await db.close();}
});

test('reversão preserva reservas, consumo autorizado e sequência posterior',async()=>{
 const db=await fixture();try{
 const reserva=(await db.query('select integracao_oficio_reservar_numero($1,2025,41) r',[id(211)])).rows[0].r;
 await db.query('select integracao_oficio_reservar_numero($1,2025,null)',[id(212)]);
 const pedido=id(301),caminho=`${id(1)}/${pedido}/oficio.pdf`;
 await db.exec('reset role;');await db.exec(reversao);await db.query("insert into storage.objects values('integracao-oficios',$1)",[caminho]);await db.exec('set role authenticated;');
 await assert.rejects(db.query('select integracao_oficio_reservar_numero($1,2025,null)',[id(213)]),/permission denied/);
 assert.equal((await db.query("select integracao_projetos_privado.permite('area_unidade') p")).rows[0].p,false);
 const dados={pedido,reserva:reserva.pedido,numero:41,data_envio:'2025-01-12',prefeitura:'Município fictício',assunto:'Assunto fictício',caminho,nome_arquivo:'oficio.pdf',mime:'application/pdf',tamanho:100,sha256:'a'.repeat(64)};
 const registrar=()=>db.query("select integracao_crm_privado.oficio_registrar_v1('registrar',$1::jsonb) r",[JSON.stringify(dados)]);
 assert.equal((await registrar()).rows[0].r.numero,41);assert.equal((await registrar()).rows[0].r.id,pedido);
 const salvo=(await db.query('select * from integracao_oficios_reservas where pedido=$1',[reserva.pedido])).rows[0];assert.equal(salvo.oficio_id,pedido);
 await db.exec('reset role;');assert.equal((await db.query('select ultimo from integracao_oficios_sequencias where ano=2025')).rows[0].ultimo,42);
 }finally{await db.close();}
});
test('códigos históricos permanecem, novas duplicidades e tentativas concorrentes são bloqueadas',async()=>{
 const db=await fixture();try{
 await db.query("update fin_receb_clientes set nome='Cadastro atualizado' where id=$1",[id(101)]);
 assert.equal((await db.query("select count(*)::int n from fin_receb_clientes where codigo='FIC01_001'")).rows[0].n,2);
 await assert.rejects(db.query('insert into fin_receb_clientes values($1,$2,$3)',[id(103),' fic01_001 ','Novo']),/outro morador/);
 await db.query('update fin_receb_clientes set codigo=$1 where id=$2',['FIC01_002',id(102)]);
 await assert.rejects(db.query('update fin_receb_clientes set codigo=$1 where id=$2',['FIC01_002',id(101)]),/outro morador/);
 const concorrentes=await Promise.allSettled([103,104].map(n=>db.query('insert into fin_receb_clientes values($1,$2,$3)',[id(n),'FIC01_003','Novo'])));
 assert.equal(concorrentes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query("select count(*)::int n from fin_receb_clientes where codigo='FIC01_003'")).rows[0].n,1);
 assert.equal((await db.query('select codigo from fin_receb_clientes where id=$1',[id(101)])).rows[0].codigo,'FIC01_001');
 }finally{await db.close();}
});
