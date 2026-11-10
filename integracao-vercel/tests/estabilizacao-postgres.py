"""Synthetic PostgreSQL 17 integration tests. Only a local socket/test database is accepted."""
import os, pathlib, subprocess, json, uuid, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOCKET=os.environ.get('INTEGRACAO_TEST_PG_SOCKET','/tmp/integracao-pg-socket')
assert SOCKET.startswith('/tmp/integracao-'), 'Only isolated local socket permitted'
BIN=os.environ.get('INTEGRACAO_TEST_PG_BIN','/tmp/integracao-pg17/bin')
DB='integracao_test_'+uuid.uuid4().hex[:12]
ENV={**os.environ,'PGHOST':SOCKET,'PGPORT':'55439','PGDATABASE':DB}
subprocess.run([BIN+'/createdb',DB],env=ENV,check=True)
def run(sql,ok=True):
 p=subprocess.run([BIN+'/psql','-XAt','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,env=ENV)
 if ok and p.returncode:raise AssertionError(p.stderr)
 return p
A='00000000-0000-4000-8000-000000000001';B='00000000-0000-4000-8000-000000000002'
R='00000000-0000-4000-8000-000000000010'
def login(who=A):return "set request.jwt.claim.sub='"+who+"';set role authenticated;"
def op(changes,expected=None):return {'table':'metas','key':{'id':R},'changes':changes,'expected':expected or {}}
def call(ops,pedido=None):
 return "select integracao_gravar('"+json.dumps(ops).replace("'","''")+"'::jsonb,'"+(pedido or str(uuid.uuid4()))+"'::uuid);"
def race(sql1,sql2):
 p=subprocess.Popen([BIN+'/psql','-XAt','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
 p.stdin.write('begin;'+login()+sql1+"select 'LOCKED';\n");p.stdin.flush()
 while True:
  line=p.stdout.readline()
  if 'LOCKED' in line:break
  if not line:raise AssertionError('first connection did not acquire lock')
 q=subprocess.Popen([BIN+'/psql','-XAt','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
 q.stdin.write(login(B)+sql2+'\n');q.stdin.close();time.sleep(.15)
 assert q.poll() is None,'second connection must await transaction lock'
 p.stdin.write('commit;\n');p.stdin.close();p.wait(timeout=10);q.wait(timeout=10)
 assert p.returncode==0,p.stderr.read()
 return q.returncode,q.stdout.read(),q.stderr.read()
try:
 run("""create schema auth;
 do $$begin if not exists(select from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,ativo boolean);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resumo text,resultado jsonb,primary key(usuario_id,pedido));
 create table metas(id uuid primary key,titulo text,nota text,criado_por uuid,visivel boolean default true);
 create table meta_responsaveis(meta_id uuid references metas(id),usuario_id uuid references profiles(id),primary key(meta_id,usuario_id));
 grant usage on schema auth,public to authenticated;grant select on profiles to authenticated;
 grant select,insert on integracao_pedidos to authenticated;grant select,insert,update on metas,meta_responsaveis to authenticated;
 alter table integracao_pedidos enable row level security;
 create policy own on integracao_pedidos to authenticated using(usuario_id=auth.uid()) with check(usuario_id=auth.uid());
 alter table metas enable row level security;
 create policy visible on metas to authenticated using(visivel or criado_por=auth.uid()) with check(visivel or criado_por=auth.uid());
 """)
 run(f"insert into profiles values('{A}',true),('{B}',true);insert into metas values('{R}','base','base','{A}',true);")
 merge=(ROOT/'supabase/migrations/20260930133924_concorrencia_global_segura.sql').read_text().split('DO $patch$')[0]
 actual=(ROOT/'docs/estabilizacao-20261110/funcoes-observadas.sql').read_text().split('CREATE OR REPLACE FUNCTION public.integracao_moradores_carga')[0]
 run(merge+actual)
 rc,out,err=race(call([op({'titulo':'A'},{'titulo':'base'})]),call([op({'nota':'B'},{'nota':'base'})]));assert rc==0,err
 assert run('select titulo||nota from metas').stdout.strip()=='AB'
 run("update metas set titulo='base',nota='base'")
 rc,out,err=race(call([op({'titulo':'A'},{'titulo':'base'})]),call([op({'titulo':'B'},{'titulo':'base'})]));assert rc!=0 and 'Revise' in err
 pedido=str(uuid.uuid4());sql=call([op({'nota':'receipt'},{'nota':'base'})],pedido)
 first=run(login()+sql).stdout;second=run(login()+sql).stdout;assert first==second
 assert run(login()+call([op({'nota':'changed'})],pedido),False).returncode!=0
 bad={'table':'meta_responsaveis','key':{'meta_id':R,'usuario_id':str(uuid.uuid4())},'insert':True,'changes':{'meta_id':R}}
 assert run(login()+call([op({'titulo':'rollback'},{'titulo':'A'}),bad]),False).returncode!=0
 assert run('select titulo from metas').stdout.strip()=='A'
 run('update metas set visivel=false')
 assert run(login(B)+call([op({'titulo':'invisible'})]),False).returncode!=0
 assert run('select titulo from metas').stdout.strip()=='A'
 # Canonical IDs change; a free-text value equal to the old ID must not change.
 run((ROOT/'supabase/migrations/20261110144604_aliases_tipados_gravacao.sql').read_text())
 run(f"create function public.erp_collab_action(text,jsonb) returns jsonb language sql as $$select jsonb_build_object('id','{R}')$$;")
 aliasops=[{'action':'evento','tempId':'temp-event','payload':{}},{'table':'metas','key':{'id':'temp-event'},'expected':{'nota':'receipt'},'changes':{'nota':'temp-event'}}]
 run(login()+call(aliasops))
 assert run('select nota from metas').stdout.strip()=='temp-event'
 # Outbox expansion is tested only in this temporary database.
 run("""do $$begin if not exists(select from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;end$$;
 create table integracao_calendario_fila(id bigint primary key,criado_em timestamptz not null,enviado_em timestamptz,tentativas integer default 0,erro text);
 grant select,update on integracao_calendario_fila to service_role;""")
 run((ROOT/'supabase/migrations/20261110143311_calendario_outbox_duravel.sql').read_text())
 assert run("set role service_role;select integracao_envios_config()->>'habilitado'").stdout.strip().endswith('false')
 assert run(login()+"select integracao_envios_config();",False).returncode!=0
 run("update integracao_envios_privado.config set corte=now(),habilitado=true;insert into integracao_calendario_fila(id,criado_em) values(1,now()),(2,now()-interval '2 days');")
 def service(sql):return 'set role service_role;'+sql
 enqueue="select integracao_envios_enfileirar('convite/1/0','convite','{\"to\":[\"test@example.invalid\"]}',1);"
 item=json.loads(run(service(enqueue)).stdout.strip().splitlines()[-1])['id']
 assert run(service("select integracao_envios_enfileirar('convite/2/0','convite','{}',2);"),False).returncode!=0
 assert run(service("select integracao_envios_enfileirar('convite/1/0','convite','{}',1);"),False).returncode!=0
 claim=f"select integracao_envios_claim('{item}');"
 holder=subprocess.Popen([BIN+'/psql','-XAt','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
 holder.stdin.write('begin;'+service(claim)+"select 'LOCKED';\n");holder.stdin.flush();lease=None
 while True:
  line=holder.stdout.readline()
  if line.startswith('{'):lease=json.loads(line)['lease']
  if 'LOCKED' in line:break
  if not line:raise AssertionError(holder.stderr.read())
 contender=run(service(claim));assert not any(line.startswith('{') for line in contender.stdout.splitlines()), 'second real connection must not acquire the same item'
 holder.stdin.write('commit;\n');holder.stdin.close();holder.wait(timeout=10);assert holder.returncode==0
 assert run("select estado from integracao_envios_privado.outbox").stdout.strip()=='enviando'
 run(service(f"select integracao_envios_finalizar('{item}','{lease}','enviado','receipt-fixture');"))
 assert run('select enviado_em is not null from integracao_calendario_fila where id=1').stdout.strip()=='t'
 assert run(service(claim)).stdout.strip()=='SET'
 uncertain=json.loads(run(service("select integracao_envios_enfileirar('resumo/test/day','resumo','{}');")).stdout.strip().splitlines()[-1])['id']
 run(service(f"select integracao_envios_claim('{uncertain}');"));run(f"update integracao_envios_privado.outbox set lease_ate=now()-interval '1 second' where id='{uncertain}'")
 run(service(f"select integracao_envios_claim('{uncertain}');"))
 assert run(f"select estado from integracao_envios_privado.outbox where id='{uncertain}'").stdout.strip()=='incerto'
 # Selective reconciliation uses exact preview/version and never resends uncertainty.
 run((ROOT/'supabase/migrations/20261110153758_recuperacao_seletiva_outbox.sql').read_text())
 preview=json.loads(run(service(f"select integracao_envios_previa(array['{uncertain}'::uuid]);")).stdout.strip().splitlines()[-1])[0]
 version=preview['versao'];evidence='a'*64
 assert run(service(f"select integracao_envios_reconciliar('{uncertain}','stale','confirmar_recibo','{evidence}','fixture');"),False).returncode!=0
 assert run(service(f"select integracao_envios_reconciliar('{uncertain}','{version}','retomar_recusado','{evidence}');"),False).returncode!=0
 run(service(f"select integracao_envios_reconciliar('{uncertain}','{version}','confirmar_recibo','{evidence}','fixture');"))
 assert run(f"select estado from integracao_envios_privado.outbox where id='{uncertain}'").stdout.strip()=='enviado'
 assert run('select count(*) from integracao_envios_privado.revisoes').stdout.strip()=='1'
 assert run(login()+f"select integracao_envios_previa(array['{uncertain}'::uuid]);",False).returncode!=0
 legacy=json.loads(run(service("select integracao_envios_previa_legado(array[2::bigint]);")).stdout.strip().splitlines()[-1])[0]
 assert run(service("select integracao_envios_autorizar_legado(2,'stale','approval-fixture');"),False).returncode!=0
 run(service(f"select integracao_envios_autorizar_legado(2,'{legacy['versao']}','approval-fixture');"))
 approved=json.loads(run(service("select integracao_envios_enfileirar('convite/2/0','convite','{}',2);")).stdout.strip().splitlines()[-1])
 assert approved['estado']=='pendente'
 assert run('select enviado_em is null from integracao_calendario_fila where id=2').stdout.strip()=='t'
 # Receipt lookup has no writes and validates payload identity under caller RLS.
 run((ROOT/'supabase/migrations/20261110152928_consulta_recibo_intencao_v2.sql').read_text())
 pedido=str(uuid.uuid4());payload=[op({'nota':'lookup'},{'nota':'temp-event'})]
 run(login()+call(payload,pedido))
 def lookup(ops,who=A):return login(who)+"select integracao_consultar_pedido('"+json.dumps(ops).replace("'","''")+"'::jsonb,'"+pedido+"'::uuid);"
 assert '{}' in run(lookup(payload)).stdout
 assert run(lookup([op({'nota':'wrong'})]),False).returncode!=0
 assert run(lookup(payload,B)).stdout.strip()=='SET\nSET'
 run(f"update profiles set ativo=false where id='{A}'")
 assert run(lookup(payload),False).returncode!=0
 print(json.dumps({'database':DB,'postgres':'17.6','passed':23,'failed':0,'scenarios':['concurrent independent fields','concurrent same field conflict','receipt replay','request payload mismatch','FK atomic rollback','RLS invisible record','typed server alias preserves free text','outbox disabled by default','outbox authenticated denied','historical backlog excluded','outbox payload mismatch','outbox two real consumers and receipt','expired lease uncertain without resend','read-only receipt lookup','receipt payload mismatch','receipt hidden from another account','inactive account receipt denied','recovery stale preview rejected','uncertain item never released for resend','selected receipt audited atomically','recovery denied to authenticated','historical stale approval rejected','historical item explicitly authorized without sending'],'limits':'Synthetic RLS/tables; deployed integracao_gravar definition; does not certify all production policies or browser queue. Outbox SQL tested against synthetic legacy table.'}))
finally:
 subprocess.run([BIN+'/dropdb',DB],env=ENV,check=True)
