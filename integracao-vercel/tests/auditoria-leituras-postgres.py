import pathlib,subprocess,os,json,uuid,time
root=pathlib.Path(__file__).resolve().parents[1];BIN='/tmp/integracao-pg17/bin';DB='integracao_test_'+uuid.uuid4().hex[:12];env={**os.environ,'PGHOST':'/tmp/integracao-pg-socket','PGPORT':'55439','PGDATABASE':DB}
def run(sql,ok=True):
 p=subprocess.run([BIN+'/psql','-XAt','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,env=env)
 if ok and p.returncode:raise AssertionError(p.stderr)
 return p
subprocess.run([BIN+'/createdb',DB],env=env,check=True)
try:
 s=pathlib.Path('/tmp/integracao-leituras-fixture.sql').read_text().replace('create role anon;','').replace('create role authenticated;','')
 run(s)
 A='10000000-0000-4000-8000-000000000001';B='10000000-0000-4000-8000-000000000004'
 login=lambda user=A:"set test.uid='"+user+"';set role authenticated;"
 get=lambda sql:json.loads(run(login()+sql).stdout.strip().splitlines()[-1])
 run("""insert into integracao_moradores(colecao,registro_id,dados,criado_por) select 'processos','perf_'||g,jsonb_build_object('municipioId','10000000-0000-4000-8000-000000000101','nucleoId','nucleo_a','codigo',lpad(g::text,6,'0'),'requerente',jsonb_build_object('nome','Pessoa fictícia '||g),'texto',repeat('x',4000)),'10000000-0000-4000-8000-000000000001'::uuid from generate_series(1,300) g;
 alter function integracao_documentos_privado.morador(text) rename to morador_original;
 create sequence chamadas_morador;grant usage,select on sequence chamadas_morador to authenticated;
 create function integracao_documentos_privado.morador(chave text) returns jsonb language plpgsql stable set search_path='' as $$begin perform nextval('public.chamadas_morador');return integracao_documentos_privado.morador_original(chave);end$$;
 grant execute on function integracao_documentos_privado.morador(text) to authenticated;
 """)
 start=time.monotonic()
 before=get("select integracao_qualificacoes_nucleo('nucleo_a');")
 old_ms=(time.monotonic()-start)*1000;old_calls=int(run('select last_value from chamadas_morador').stdout.strip());run('alter sequence chamadas_morador restart with 1;')
 for m in ['20261110162126_leitura_consistente_resumo.sql','20261110162130_qualificacoes_consulta_materializada.sql','20261110162539_carteira_crm_delta.sql']:run((root/'supabase/migrations'/m).read_text())
 start=time.monotonic();assert get("select integracao_qualificacoes_nucleo('nucleo_a');")==before
 new_ms=(time.monotonic()-start)*1000;new_calls=int(run('select last_value from chamadas_morador').stdout.strip());assert new_calls<old_calls,(old_calls,new_calls)
 print(json.dumps({'qualificationRows':301,'oldCalls':old_calls,'newCalls':new_calls,'oldMs':round(old_ms,2),'newMs':round(new_ms,2)}))
 page=get('select integracao_moradores_pagina_v2();')
 # Connection 2 changes data and revision atomically while connection 1 holds an old snapshot.
 proc=subprocess.Popen([BIN+'/psql','-XAt','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
 proc.stdin.write('begin isolation level repeatable read;'+login()+"select integracao_moradores_pagina_v2();\n");proc.stdin.flush()
 old=None
 while old is None:
  line=proc.stdout.readline()
  if line.startswith('{'):old=json.loads(line)
 run("update fin_receb_clientes set nome='Changed ficticio';update integracao_revisoes set versao=versao+1 where modulo='clientes';")
 proc.stdin.write("select integracao_moradores_pagina_v2(500,'"+old['revisao']+"');commit;\n");proc.stdin.close();proc.wait(timeout=15);assert proc.returncode==0,proc.stderr.read()
 assert run(login()+"select integracao_moradores_pagina_v2(500,'"+page['revisao']+"');",False).returncode!=0
 delta=get('select integracao_carteira_delta();');manifest=json.dumps(delta['manifesto']).replace("'","''")
 assert get("select integracao_carteira_delta('"+manifest+"');")['alterados']=={}
 run("delete from integracao_moradores where registro_id='morador_b';")
 assert 'm/morador_b' not in get("select integracao_carteira_delta('"+manifest+"');")['manifesto']
 assert run(login(B)+'select integracao_carteira_delta();',False).returncode!=0
 print(json.dumps({'postgres':'17.6','twoConnections':True,'sameCountRevisionRejected':True,'oldSnapshotConsistent':True,'deltaDeletion':True,'rlsDenied':True,'qualificationEquivalent':True}))
finally:subprocess.run([BIN+'/dropdb',DB],env=env,check=True)
