"""PostgreSQL descartável, sem DSN ou conexão externa. Requer pgserver e psycopg[binary]."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import time
import uuid
import fasteners
import pgserver
import psycopg

root = Path(__file__).resolve().parent.parent
admin = '00000000-0000-4000-8000-000000000001'

with TemporaryDirectory(prefix='oficios-concorrencia-', dir='/tmp') as temp:
    path = Path(temp)
    pgserver.PostgresServer.runtime_path = path / 'runtime'
    pgserver.PostgresServer.lock_path = path / 'runtime' / '.lockfile'
    pgserver.PostgresServer._lock = fasteners.InterProcessLock(pgserver.PostgresServer.lock_path)
    server = pgserver.get_server(path / 'data', cleanup_mode='delete')
    try:
        uri = server.get_uri()
        assert 'host=/' in uri or 'host=%2F' in uri, 'Somente socket Unix descartável'
        with psycopg.connect(uri, autocommit=True) as setup:
            setup.execute((root / 'tests/oficios-db.fixture.sql').read_text())
            for file in ['oficios.sql', 'oficios-equipe.sql']:
                setup.execute((root / 'supabase/operacoes' / file).read_text())
            pedido = str(uuid.uuid4())
            dados = dict(pedido=pedido, numero=42, data_envio='2025-01-10', prefeitura='Prefeitura Teste', assunto='Ofício original', caminho=f'{admin}/{pedido}/oficio.txt', nome_arquivo='oficio.txt', mime='text/plain', tamanho=20, sha256='a'*64, resumo='Resumo da versão original.', resumo_status='revisado')
            setup.execute("insert into storage.objects values('integracao-oficios',%s)", [dados['caminho']])
            setup.execute("select set_config('request.jwt.claim.sub',%s,false)", [admin])
            original = setup.execute("select integracao_oficios_operar('registrar',%s)", [json.dumps(dados)]).fetchone()[0]
            setup.execute((root / 'supabase/migrations/20261026184153_oficios_versoes.sql').read_text())
            versao = {k: original[k] for k in ['prefeitura','assunto','caminho','nome_arquivo','mime','tamanho','sha256','resumo','resumo_status']}
            versao.update(pedido=str(uuid.uuid4()), oficio_id=pedido, base_id=pedido, resumo='Informações da v2')

            def sessao(connection):
                connection.execute('set role authenticated')
                connection.execute("select set_config('request.jwt.claim.sub',%s,false)", [admin])

            def atualizar(data):
                try:
                    with psycopg.connect(uri) as connection:
                        sessao(connection)
                        return connection.execute("select integracao_oficios_operar('atualizar',%s)", [json.dumps(data)]).fetchone()[0]
                except psycopg.errors.RaiseException as error:
                    return str(error)

            with ThreadPoolExecutor(max_workers=8) as executor, psycopg.connect(uri) as primeira:
                sessao(primeira)
                v2 = primeira.execute("select integracao_oficios_operar('atualizar',%s)", [json.dumps(versao)]).fetchone()[0]
                outro = {**versao, 'pedido': str(uuid.uuid4()), 'resumo':'Edição concorrente'}
                concorrente = executor.submit(atualizar, outro)
                bloqueou = False
                for _ in range(100):
                    bloqueou = setup.execute("select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like 'select integracao_oficios_operar%')").fetchone()[0]
                    if bloqueou:
                        break
                    time.sleep(0.02)
                assert bloqueou, 'A segunda sessão deve esperar o lock da primeira'
                assert not concorrente.done()
                primeira.commit()
                assert 'recebeu outra versão' in concorrente.result(timeout=5)
                repeticoes = list(executor.map(atualizar, [versao]*8))
                assert all(r == v2 for r in repeticoes), 'Mesmo pedido simultâneo deve retornar a mesma v2'
                disputas = [{**outro, 'pedido':str(uuid.uuid4()), 'base_id':v2['id'], 'resumo':f'Proposta v3 {i}'} for i in range(2)]
                resultados = list(executor.map(atualizar, disputas))
                assert len([r for r in resultados if isinstance(r,dict) and r['versao']==3]) == 1
                assert len([r for r in resultados if isinstance(r,str) and 'recebeu outra versão' in r]) == 1

            assert setup.execute('select array_agg(versao order by versao) from integracao_oficios_versoes').fetchone()[0] == [1,2,3]
            assert setup.execute('select to_jsonb(o) from integracao_oficios o').fetchone()[0] == original
            assert setup.execute('select ultimo from integracao_oficios_sequencias').fetchone()[0] == 42
            print('PASS: PostgreSQL 16 local, lock observado entre sessões, oito repetições simultâneas idempotentes, disputa por v2/v3 sem perda e v1 integral preservada.')
    finally:
        server.cleanup()
