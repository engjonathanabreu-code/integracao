import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarBancoObservacoes, idObservacoes as id, loginObservacoes as login, PERFIS_OBSERVACOES as u, rpcObservacoes as rpc } from './helpers/observacoes-db.mjs';
const conteudo = (texto = 'Conferir matrícula', checked = false) => ({ version: 1, blocks: [{ id: 'texto', type: 'paragraph', runs: [{ text: 'Documentos', bold: true }] }, { id: 'item', type: 'check', checked, runs: [{ text: texto, italic: true }] }] });
const novo = (n, texto) => ({ id: id(n), versao: 0, conteudo: conteudo(texto) });
const negado = e => e.code === '42501';
const conflito = e => e.code === '40001';
const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8');

test('observações: SQL aditivo, RLS real, persistência, CAS, histórico e proteção REST', async t => {
  const db = await criarBancoObservacoes({ aplicarModulo: false });
  try {
    const assinatura = async () => (await db.query(`select jsonb_build_object('moradores',(select jsonb_agg(to_jsonb(m) order by registro_id) from integracao_moradores m),'clientes',(select jsonb_agg(to_jsonb(c) order by id) from fin_receb_clientes c),'perfis',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),'revisoes',(select jsonb_agg(to_jsonb(r)) from integracao_revisoes r)) dados`)).rows[0].dados;
    const antes = await assinatura();
    await db.exec(ler('../supabase/operacoes/documentos-observacoes-20261106.sql'));
    assert.deepEqual(await assinatura(), antes, 'instalação preserva todos os registros anteriores');

    await t.test('criar, listar, reler em outra sessão e checklist mantêm o conteúdo exato', async () => {
      await login(db,u.projeto);
      const row = await rpc(db,'salvar','compartilhado',novo(200));
      assert.equal(row.versao,1); assert.equal(row.autor_id,u.projeto); assert.equal(row.autor_nome,'Projetos Teste 1'); assert.deepEqual(row.conteudo,conteudo());
      await login(db,u.outro);
      const lista = await rpc(db,'listar','compartilhado'); assert.equal(lista.total,1); assert.deepEqual(lista.itens[0].conteudo,conteudo());
      assert.deepEqual((await db.query('select conteudo from integracao_documentos_observacoes where id=$1',[id(200)])).rows[0].conteudo,conteudo());
      await login(db,u.projeto);
      const salvo = await rpc(db,'salvar','compartilhado',{id:id(200),versao:1,conteudo:conteudo('Conferir matrícula',true)});
      assert.equal(salvo.versao,2); assert.equal(salvo.conteudo.blocks[1].checked,true);
      await login(db,u.outro); assert.equal((await rpc(db,'listar','compartilhado')).itens[0].conteudo.blocks[1].checked,true);
    });

    await t.test('anon, inativo, consulta e morador fora do escopo não conseguem inserir por RPC/REST', async () => {
      await login(db,null,'anon'); await assert.rejects(rpc(db,'listar','compartilhado'),negado);
      await assert.rejects(db.query('select * from integracao_documentos_observacoes'),negado);
      for (const usuario of [u.inativo,u.consulta]) {
        await login(db,usuario); await assert.rejects(rpc(db,'salvar','compartilhado',novo(210)),negado);
        await assert.rejects(db.query('insert into integracao_documentos_observacoes(id,processo_id,conteudo) values($1,$2,$3)',[id(210),'compartilhado',JSON.stringify(conteudo())]),negado);
      }
      await login(db,u.projeto); await rpc(db,'salvar','privado',novo(201));
      await login(db,u.outro); await assert.rejects(rpc(db,'listar','privado'),negado); await assert.rejects(rpc(db,'salvar','privado',novo(211)),negado);
      assert.equal((await db.query('select * from integracao_documentos_observacoes where processo_id=$1',['privado'])).rows.length,0);
      await login(db,u.projeto);
      for (const processo of ['inativo','arquivado','inexistente']) await assert.rejects(rpc(db,'salvar',processo,novo(212)),negado);
    });

    await t.test('autoria é UUID: outro usuário não altera, diretoria administra apenas no próprio escopo', async () => {
      await login(db,u.outro);
      await assert.rejects(rpc(db,'salvar','compartilhado',{id:id(200),versao:2,conteudo:conteudo('Mudança indevida')}),negado);
      assert.equal((await db.query('update integracao_documentos_observacoes set conteudo=$1,versao=3 where id=$2 returning id',[JSON.stringify(conteudo('Mudança indevida')),id(200)])).rows.length,0);
      await login(db,u.diretor);
      const editada = await rpc(db,'salvar','compartilhado',{id:id(200),versao:2,conteudo:conteudo('Revisada pela diretoria')});
      assert.equal(editada.autor_id,u.projeto); assert.equal(editada.ultimo_editor_id,u.diretor);
      await assert.rejects(rpc(db,'salvar','privado',{id:id(201),versao:1,conteudo:conteudo('Fora do escopo')}),negado);
      await login(db,u.admin); assert.equal((await rpc(db,'listar','privado')).total,1);
    });

    await t.test('morador financeiro sem complemento e alias legado persistem sem criar ou alterar cadastro', async () => {
      await db.exec('reset role');
      for(const n of [102,103,104,105]) await db.query('insert into fin_receb_clientes(id,nome,ativo) values($1,$2,true)',[id(n),`Morador fictício ${n}`]);
      await db.query(`insert into integracao_complementos(colecao,registro_id,dados,criado_por,referencia_tabela,referencia_id) values('processos','alias-legado','{"situacao":"Ativo"}',$1,'fin_receb_clientes',$2),('processos','alias-ambiguo-b','{"situacao":"Ativo"}',$1,'fin_receb_clientes',$3)`,[u.projeto,id(103),id(104)]);
      await db.query(`insert into integracao_moradores(colecao,registro_id,dados,criado_por,referencia_tabela,referencia_id) values('processos','alias-ambiguo-a','{"situacao":"Ativo"}',$1,'fin_receb_clientes',$2)`,[u.projeto,id(104)]);
      const atuais=await db.query('select (select count(*)::int from integracao_moradores) moradores,(select count(*)::int from integracao_complementos) complementos');
      await login(db,u.projeto);
      assert.equal((await rpc(db,'salvar',id(102),novo(260))).processo_id,id(102));
      assert.equal((await rpc(db,'salvar','alias-legado',novo(261))).processo_id,'alias-legado');
      await assert.rejects(rpc(db,'salvar',id(103),novo(262)),negado,'não cria uma segunda identidade para alias existente');
      for(const ambigua of ['alias-ambiguo-a','alias-ambiguo-b',id(104)]) await assert.rejects(rpc(db,'salvar',ambigua,novo(263)),negado);
      await assert.rejects(rpc(db,'salvar',id(999),novo(264)),negado);
      await db.exec('reset role');
      assert.deepEqual((await db.query('select (select count(*)::int from integracao_moradores) moradores,(select count(*)::int from integracao_complementos) complementos')).rows,atuais.rows);
      // Confirma que uma restrição adicional de escopo no canônico é respeitada,
      // em vez de uma função privilegiada contornar a RLS para o fallback.
      await db.exec(`create policy escopo_adicional_teste on fin_receb_clientes as restrictive for select to authenticated using(id<>'${id(105)}');`);
      await login(db,u.projeto); await assert.rejects(rpc(db,'salvar',id(105),novo(265)),negado);
      await db.exec('reset role;drop policy escopo_adicional_teste on fin_receb_clientes;');
    });

    await t.test('retries idempotentes e envios concorrentes não duplicam; conflitos não sobrescrevem', async () => {
      await login(db,u.projeto);
      const duplicados = await Promise.all([rpc(db,'salvar','compartilhado',novo(220)),rpc(db,'salvar','compartilhado',novo(220))]);
      assert.equal(duplicados[0].id,duplicados[1].id); assert.equal(duplicados[1].versao,1);
      const corridas = await Promise.allSettled([
        rpc(db,'salvar','compartilhado',{id:id(220),versao:1,conteudo:conteudo('Sessão A')}),
        rpc(db,'salvar','compartilhado',{id:id(220),versao:1,conteudo:conteudo('Sessão B')})
      ]);
      assert.equal(corridas.filter(r=>r.status==='fulfilled').length,1); assert.equal(corridas.find(r=>r.status==='rejected').reason.code,'40001');
      const atual = (await db.query('select * from integracao_documentos_observacoes where id=$1',[id(220)])).rows[0];
      assert.equal(atual.versao,2);
      const repetido = await rpc(db,'salvar','compartilhado',{id:id(220),versao:1,conteudo:atual.conteudo}); assert.equal(repetido.versao,2);
      await assert.rejects(rpc(db,'salvar','compartilhado',novo(220,'Novo texto sobre ID existente')),conflito);
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int n from integracao_documentos_observacoes_privado.historico where observacao_id=$1',[id(220)])).rows[0].n,2);
    });

    await t.test('excluir/restaurar preserva histórico e conteúdo, sem conceder DELETE físico', async () => {
      await login(db,u.projeto);
      const excluida = await rpc(db,'excluir','compartilhado',{id:id(220),versao:2}); assert.equal(excluida.versao,3); assert.ok(excluida.excluido_em);
      assert.equal((await rpc(db,'excluir','compartilhado',{id:id(220),versao:2})).versao,3);
      assert.ok((await rpc(db,'listar','compartilhado',{excluidas:true})).itens.some(o=>o.id===id(220)));
      assert.ok(!(await rpc(db,'listar','compartilhado')).itens.some(o=>o.id===id(220)));
      await assert.rejects(rpc(db,'salvar','compartilhado',{id:id(220),versao:3,conteudo:conteudo('Editar excluída')}),/Restaure/);
      await login(db,u.outro); assert.equal((await rpc(db,'listar','compartilhado',{excluidas:true})).total,0);
      await login(db,u.projeto);
      const restaurada = await rpc(db,'restaurar','compartilhado',{id:id(220),versao:3}); assert.equal(restaurada.versao,4); assert.equal(restaurada.excluido_em,null); assert.deepEqual(restaurada.conteudo,excluida.conteudo);
      await assert.rejects(db.query('delete from integracao_documentos_observacoes where id=$1',[id(220)]),negado);
      await assert.rejects(db.query('update integracao_documentos_observacoes_privado.historico set registro=$1',[{}]),negado);
      await db.exec('reset role');
      const historico=(await db.query('select versao,acao,registro from integracao_documentos_observacoes_privado.historico where observacao_id=$1 order by versao',[id(220)])).rows;
      assert.deepEqual(historico.map(h=>h.acao),['criar','editar','excluir','restaurar']); assert.deepEqual(historico[0].registro.conteudo,conteudo());
    });

    await t.test('REST direto não transfere identidade, falsifica autoria ou ignora CAS', async () => {
      await login(db,u.projeto);
      await assert.rejects(db.query('update integracao_documentos_observacoes set processo_id=$1 where id=$2',['privado',id(200)]),negado);
      await assert.rejects(db.query('update integracao_documentos_observacoes set autor_id=$1 where id=$2',[u.outro,id(200)]),negado);
      await assert.rejects(db.query('insert into integracao_documentos_observacoes(id,processo_id,conteudo,autor_id) values($1,$2,$3,$4)',[id(230),'compartilhado',JSON.stringify(conteudo()),u.outro]),negado);
      await assert.rejects(db.query('update integracao_documentos_observacoes set conteudo=$1 where id=$2',[JSON.stringify(conteudo('Sem versão')),id(200)]),conflito);
      await assert.rejects(db.query('update integracao_documentos_observacoes set conteudo=$1,versao=2 where id=$2',[JSON.stringify(conteudo('Versão antiga')),id(200)]),conflito);
    });

    await t.test('validação server rejeita conteúdo malicioso/estranho inclusive via REST', async () => {
      await login(db,u.projeto);
      const mutacoes = [
        c => c.html='<script>1</script>', c => c.blocks[0].onclick='alert(1)', c => c.blocks[0].runs[0].html='<img src=x onerror=alert(1)>',
        c => c.blocks[0].type='script', c => c.blocks[1].checked='false', c => c.blocks[1].id='texto',
        c => c.blocks[0].runs[0].bold=false, c => c.blocks[0].runs[0].text='x'.repeat(20001),
        c => c.blocks[0].runs=[], c => c.blocks[0].id=4, c => c.blocks[1].checked=null,
        c => c.blocks[0].runs[0].text=null, c => c.blocks[0].runs[0].text={script:'evil'},
        c => c.blocks=Array.from({length:201},(_,i)=>({id:`b${i}`,type:'paragraph',runs:[{text:'a'}]}))
      ];
      for (const alterar of mutacoes) {
        const c=conteudo();alterar(c);
        await assert.rejects(rpc(db,'salvar','compartilhado',{id:id(240),versao:0,conteudo:c}),e=>e.code==='22023');
        await assert.rejects(db.query('insert into integracao_documentos_observacoes(id,processo_id,conteudo) values($1,$2,$3)',[id(240),'compartilhado',JSON.stringify(c)]),e=>e.code==='22023');
      }
      await assert.rejects(rpc(db,'salvar','compartilhado',{...novo(241),autor_id:u.outro}),e=>e.code==='22023');
      await assert.rejects(rpc(db,'salvar','compartilhado',{...novo(241),versao:null}),e=>e.code==='22023');
      await assert.rejects(rpc(db,'listar','compartilhado',{inicio:null}),e=>e.code==='22023');
      assert.equal((await db.query('select count(*)::int n from integracao_documentos_observacoes where id=$1',[id(240)])).rows[0].n,0);
    });

    await t.test('contrato explícito negado e revisão de perfil incompatível bloqueiam escrita', async () => {
      await db.exec('reset role');
      await db.query(`insert into integracao_atribuicoes_privado.contratos(usuario_id,revisao_perfil,regras) select id,md5(row(id,tipo,setor,ativo,updated_at)::text),$2 from profiles where id=$1`,[u.projeto,JSON.stringify({clientes:{editar:false}})]);
      await login(db,u.projeto); await assert.rejects(rpc(db,'salvar','compartilhado',novo(250)),negado);
      await db.exec('reset role'); await db.query('update integracao_atribuicoes_privado.contratos set regras=$2 where usuario_id=$1',[u.projeto,JSON.stringify({clientes:{editar:true}})]);
      await login(db,u.projeto); await rpc(db,'salvar','compartilhado',novo(250));
      await db.exec('reset role'); await db.query("update profiles set updated_at=updated_at+interval '1 second' where id=$1",[u.projeto]);
      await login(db,u.projeto); await assert.rejects(rpc(db,'salvar','compartilhado',novo(251)),negado);
      await db.exec('reset role'); await db.query('delete from integracao_atribuicoes_privado.contratos where usuario_id=$1',[u.projeto]);
    });

    await t.test('paginação retorna total integral e atualização dispara revisão compartilhada', async () => {
      await login(db,u.projeto);
      for(let n=300;n<324;n++) await rpc(db,'salvar','compartilhado',novo(n,`Observação ${n}`));
      const pagina=await rpc(db,'listar','compartilhado',{inicio:0,limite:20}), proxima=await rpc(db,'listar','compartilhado',{inicio:20,limite:20});
      assert.ok(pagina.total>20); assert.equal(pagina.itens.length,20); assert.equal(proxima.total,pagina.total);
      const ids=[...pagina.itens,...proxima.itens].map(o=>o.id);assert.equal(new Set(ids).size,pagina.total);
      assert.ok((await db.query("select versao from integracao_revisoes where modulo='clientes'")).rows[0].versao>0);
      await db.exec('reset role');
      assert.deepEqual((await db.query('select dados from integracao_moradores where registro_id=$1',['compartilhado'])).rows[0].dados,antes.moradores.find(m=>m.registro_id==='compartilhado').dados);
    });

    await t.test('reversão bloqueia novas gravações e preserva observações e histórico já gerados', async () => {
      await db.exec('reset role');
      const registros=await db.query('select id,conteudo,versao from integracao_documentos_observacoes order by id');
      const historico=await db.query('select registro from integracao_documentos_observacoes_privado.historico order by observacao_id,versao');
      await db.exec(ler('../supabase/operacoes/documentos-observacoes-20261106-reversao.sql'));
      await login(db,u.projeto); await assert.rejects(rpc(db,'salvar','compartilhado',novo(400)),negado);
      await assert.rejects(db.query('insert into integracao_documentos_observacoes(id,processo_id,conteudo) values($1,$2,$3)',[id(400),'compartilhado',JSON.stringify(conteudo())]),negado);
      await db.exec('reset role');
      assert.deepEqual((await db.query('select id,conteudo,versao from integracao_documentos_observacoes order by id')).rows,registros.rows);
      assert.deepEqual((await db.query('select registro from integracao_documentos_observacoes_privado.historico order by observacao_id,versao')).rows,historico.rows);
    });
  } finally { await db.close(); }
});
