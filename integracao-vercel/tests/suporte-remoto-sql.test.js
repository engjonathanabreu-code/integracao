import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
// Deterministic credentials exist only in disposable fixtures. Production uses random 256-bit local proofs.
const prova=(inst,n=2)=>createHash('sha256').update('fixture:'+n+':'+inst).digest('hex');
const vinculo=(inst,n=2)=>({instalacao_id:inst,prova_instalacao:prova(inst,n)});
const diagnostico=inst=>id(10000+Number(inst.slice(-12)));
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const migration='../supabase/migrations/20261112190126_suporte_remoto_exclusivo.sql';
const fixture=`create role authenticated;create role anon;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table profiles(id uuid primary key,nome text,ativo boolean,tipo text);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resultado jsonb,primary key(usuario_id,pedido));
 create table integracao_sincronizacao_dispositivos(usuario_id uuid,instalacao_id uuid,versao text,ultimo_contato timestamptz,resumo jsonb);
 insert into profiles values('${id(1)}','Operador de teste',true,'Administrador'),('${id(2)}','Conta A',true,'Topografia'),('${id(3)}','Outro administrador',true,'Administrador'),('${id(4)}','Outro diretor',true,'Diretor Técnico'),('${id(5)}','Conta inativa',false,'Administrador');`;
// PGlite uses one connection; SKIP LOCKED syntax is exercised, not actual
// simultaneous locks between server connections. Browser tests cover two tabs.
test('suporte SQL: autorização exclusiva, duas contas/aparelhos, protocolo, revogação e reversão',async t=>{
 const db=new PGlite();let conta=1,sessao=id(101),seq=800;
 const login=async(n,sid=id(100+n))=>{conta=n;sessao=sid;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id(n),JSON.stringify({sub:id(n),session_id:sid,user_metadata:{role:'Administrador',suporte:true}})]);await db.exec('set role authenticated');};
 const admin=async(sql,params=[])=>{await db.exec('reset role');try{return await db.query(sql,params);}finally{await login(conta,sessao);}};
 const rpc=async(acao,args={})=>(await db.query('select public.integracao_suporte_operar($1,$2::jsonb) r',[acao,JSON.stringify(args)])).rows[0].r;
 const usar=async(inst=id(20),n=2)=>{await login(n);await rpc('contatar',{...vinculo(inst,n),diagnostico_instalacao_id:diagnostico(inst),versao:'teste-sync-v1',protocolo:1});};
 const criar=async({inst=id(++seq),tipo='diagnostico',pedido=null}={})=>{await usar(inst);await login(1);const args={id:crypto.randomUUID(),atendimento:id(600),usuario_id:id(2),instalacao_id:inst,tipo,pedido};return {args,cmd:await rpc('solicitar',args)};};
 const receber=async(c,consumidor=id(++seq))=>{await login(2);const r=await rpc('receber',{...vinculo(c.args.instalacao_id),consumidor});return {...c,consumidor,recebido:r.comando};};
 const ref=c=>({id:c.cmd.id,...vinculo(c.args.instalacao_id),consumidor:c.consumidor});
 const iniciar=async c=>{const r=await rpc('autorizar',ref(c));assert.equal(r.autorizado,true);return c;};
 const estado=async c=>(await admin('select estado from integracao_suporte_privado.solicitacoes where id=$1',[c.cmd.id])).rows[0].estado;
 const resultado={codigo:'DIAGNOSTICO',itens:[]};
 const diag={id:id(700),pedido:id(700),estado:'confirmado_aguardando_leitura',codigo:'23514',fase:'releitura',tentativas:2,temRecibo:true,dependencias:[id(701)],restricao:'fin_receb_clientes_dia_vencimento_check',espera:'dependencia'};
 try{
  await db.exec(fixture);
  await db.query('insert into auth.sessions(id,user_id) select ($1::uuid[])[row_number() over(order by id)],id from profiles',[[id(101),id(102),id(103),id(104),id(105)]]);
  await db.query('insert into auth.sessions values($1,$2,null)',[id(202),id(2)]);
  await db.exec(read(migration));await login(1);
  await t.test('desativado e sem operador até vínculo administrativo explícito',async()=>{
   assert.deepEqual(await rpc('capacidade'),{operador:false,habilitado:false});
   await assert.rejects(rpc('listar'),{code:'42501'});
   await assert.rejects(rpc('contatar',{instalacao_id:id(20),versao:'teste',protocolo:1}),{code:'42501'});
   await admin('update integracao_suporte_privado.config set operador=$1',[id(1)]);
   assert.deepEqual(await rpc('capacidade'),{operador:true,habilitado:false});
   assert.equal((await rpc('listar')).config.habilitado,false);
   for(const n of [2,3,4,5]){await login(n);assert.equal((await rpc('capacidade')).operador,false);await assert.rejects(rpc('listar'),{code:'42501'});}
   await login(1,id(999));assert.equal((await rpc('capacidade')).operador,false);await assert.rejects(rpc('listar'),{code:'42501'});await login(1);
  });
  await t.test('não concede tabelas, helpers ou SECURITY DEFINER público a contas autenticadas',async()=>{
   await admin('update integracao_suporte_privado.config set habilitado=true');
   for(const n of [1,2,3,4]){await login(n);for(const tabela of ['config','dispositivos','solicitacoes','auditoria'])await assert.rejects(db.query('select * from integracao_suporte_privado.'+tabela),{code:'42501'});await assert.rejects(db.query("select integracao_suporte_privado.resultado_valido('{}')"),{code:'42501'});}
   for(const role of ['anon','service_role']){await db.exec('reset role;set role '+role);await assert.rejects(rpc('capacidade'),{code:'42501'});await assert.rejects(db.query('select * from integracao_suporte_privado.config'),{code:'42501'});}await login(1);
   const p=(await admin("select prosecdef,proconfig from pg_proc where oid='public.integracao_suporte_operar(text,jsonb)'::regprocedure")).rows[0];assert.equal(p.prosecdef,false);assert.deepEqual(p.proconfig,['search_path=""']);
   assert.equal((await admin("select bool_and(relrowsecurity) v from pg_class where relnamespace='integracao_suporte_privado'::regnamespace and relkind='r'")).rows[0].v,true);
  });
  await t.test('registra apenas instalação da própria sessão e mantém relatos antigos distintos',async()=>{
   await usar(id(20));await usar(id(21));
   await assert.rejects(rpc('contatar',{...vinculo(id(22)),diagnostico_instalacao_id:diagnostico(id(22)),versao:'teste',protocolo:1,usuario_id:id(3)}),{code:'22023'});
   await assert.rejects(rpc('contatar',{...vinculo(id(22)),diagnostico_instalacao_id:diagnostico(id(22)),versao:'nome privado CPF',protocolo:1}),{code:'22023'});
   await assert.rejects(rpc('contatar',{...vinculo(id(22)),diagnostico_instalacao_id:diagnostico(id(22)),versao:'teste',protocolo:2}),{code:'22023'});
   await admin('insert into integracao_sincronizacao_dispositivos values($1,$2,$3,now()-interval \'1 day\',$4)',[id(3),id(30),'anterior',JSON.stringify([{estado:'pendente_local',modulo:'usuarios',codigo:'SEM_ERRO',quantidade:1}])]);
   await login(1);const lista=await rpc('listar');assert.equal(lista.dispositivos.length,3);assert.equal(lista.dispositivos.find(d=>d.instalacao_id===id(30)).protocolo,null);assert.equal(lista.dispositivos.filter(d=>d.usuario_id===id(2)).length,2);
  });
  await t.test('prova local impede substituir registro ou consumir comando de outro navegador da mesma conta',async()=>{
   const inst=id(20),falsa='ff'.repeat(32);await login(2,id(202));
   const invalida={...vinculo(inst),diagnostico_instalacao_id:diagnostico(inst),prova_instalacao:falsa,versao:'teste',protocolo:1};
   await assert.rejects(rpc('contatar',invalida),e=>e.code==='42501'&&!String(e.message).includes(falsa));
   await assert.rejects(rpc('contatar',{...invalida,prova_instalacao:prova(inst),diagnostico_instalacao_id:id(999)}),{code:'42501'},'associação antiga também não pode ser substituída');
   await assert.rejects(rpc('receber',{...vinculo(inst),prova_instalacao:falsa,consumidor:id(95)}),{code:'42501'});
   await usar(inst,2);assert.equal((await rpc('receber',{...vinculo(inst),consumidor:id(95)})).comando,null);
   await login(1);const lista=await rpc('listar');const texto=JSON.stringify(lista);
   assert.doesNotMatch(texto,/prova_instalacao|prova_hash/);assert.ok(!texto.includes(prova(inst)));
   const hash=(await admin("select encode(prova_hash,'hex') h from integracao_suporte_privado.dispositivos where usuario_id=$1 and instalacao_id=$2",[id(2),inst])).rows[0].h;assert.ok(!texto.includes(hash));
   assert.equal(lista.dispositivos.find(x=>x.instalacao_id===inst).diagnostico_instalacao_id,diagnostico(inst));
  });
  await t.test('rejeita tipos, chaves e destinos inválidos; outro administrador não emite',async()=>{
   const a={id:id(40),atendimento:id(600),usuario_id:id(2),instalacao_id:id(20),tipo:'diagnostico'};
   for(const change of [{tipo:'sql'},{tipo:'consultar_recibo'},{payload:{cpf:'privado'}},{id:'not-uuid'},{usuario_id:id(3)},{instalacao_id:id(31)}])await assert.rejects(rpc('solicitar',{...a,...change}),{code:'22023'});
   await assert.rejects(rpc('executar_codigo',{}),{code:'22023'});
   await assert.rejects(rpc('listar',{sql:'select *'}),{code:'22023'});
   for(const n of [2,3,4]){await login(n);await assert.rejects(rpc('solicitar',a),{code:'42501'});}
   await login(1);
  });
  let primeira;
  await t.test('nonce idempotente, cooldown e apenas um comando ativo por aparelho',async()=>{
   primeira=await criar({inst:id(20)});assert.deepEqual(await rpc('solicitar',primeira.args),primeira.cmd);
   assert.equal((await admin('select count(*)::int n from integracao_suporte_privado.auditoria where solicitacao_id=$1',[primeira.cmd.id])).rows[0].n,1);
   await assert.rejects(rpc('solicitar',{...primeira.args,tipo:'revisar_bloqueios'}),{code:'22023'});
   await assert.rejects(rpc('solicitar',{...primeira.args,id:crypto.randomUUID()}),{code:'55000'});
  });
  await t.test('reserva por conta, instalação, consumidor e sessão; autorização é one-shot',async()=>{
   primeira=await receber(primeira,id(50));assert.equal(primeira.recebido.id,primeira.cmd.id);
   assert.equal((await rpc('receber',{...vinculo(id(21)),consumidor:id(51)})).comando,null);
   assert.equal((await rpc('receber',{...vinculo(id(20)),consumidor:id(51)})).comando,null);
   assert.equal((await rpc('receber',{...vinculo(id(20)),consumidor:id(50)})).comando.id,primeira.cmd.id,'resposta perdida de recebimento conserva a mesma identidade');
   await login(3);await assert.rejects(rpc('autorizar',ref(primeira)),{code:'42501'});
   await login(2,id(202));await assert.rejects(rpc('autorizar',ref(primeira)),{code:'42501'});await login(2);
   for(const acao of ['autorizar','validar_execucao'])await assert.rejects(rpc(acao,{...ref(primeira),prova_instalacao:'ff'.repeat(32)}),{code:'42501'});
   await assert.rejects(rpc('concluir',{...ref(primeira),prova_instalacao:'ff'.repeat(32),estado:'concluida',resultado}),{code:'42501'});
   await iniciar(primeira);assert.deepEqual(await rpc('autorizar',ref(primeira)),{autorizado:false});assert.deepEqual(await rpc('validar_execucao',ref(primeira)),{autorizado:true});
  });
  await t.test('resultado técnico rejeita conteúdo sensível sem mudar estado ou auditoria',async()=>{
   const base={codigo:'DIAGNOSTICO',itens:[diag]};
   for(const result of [{...base,message:'CPF privado'},{...base,codigo:'conteúdo privado'},{...base,itens:[{...diag,payload:{cpf:'privado'}}]},{...base,itens:[{...diag,restricao:'restricao_privada'}]},{...base,itens:[{...diag,dependencias:['cpf-privado']}]},{...base,itens:[{...diag,tentativas:-1}]},{...base,itens:[{...diag,espera:'texto privado'}]}])await assert.rejects(rpc('concluir',{...ref(primeira),estado:'concluida',resultado:result}),{code:'22023'});
   assert.equal(await estado(primeira),'iniciada');
   const r=await rpc('concluir',{...ref(primeira),estado:'concluida',resultado:base});assert.equal(r.aceito,true);assert.equal(r.recibo_no_servidor,false);assert.equal(r.leitura_comprovacao,'relato_aparelho');
   const repetido=await rpc('concluir',{...ref(primeira),estado:'concluida',resultado:base});assert.deepEqual(repetido,r);
   await assert.rejects(rpc('concluir',{...ref(primeira),estado:'concluida',resultado}),{code:'22023'});
   await login(1);await assert.rejects(rpc('solicitar',{...primeira.args,id:crypto.randomUUID()}),{code:'55000'},'cooldown vale também após encerramento');
   const a=(await rpc('listar')).auditoria[0];assert.ok(a.em);assert.ok(a.ator);assert.equal(Object.hasOwn(a,'criado_em'),false);
  });
  await t.test('presença do recibo é verificada na mesma conta sem expor ou modificar seu conteúdo',async()=>{
   await admin('insert into integracao_pedidos values($1,$2,$3),($4,$5,$6)',[id(2),id(700),JSON.stringify({cpf:'não retornar',aliases:{}}),id(3),id(701),JSON.stringify({senha:'não retornar'})]);
   const antes=(await admin('select md5(string_agg(to_jsonb(p)::text,\'\' order by usuario_id,pedido)) h from integracao_pedidos p')).rows[0].h;
   for(const [pedido,presente] of [[id(700),true],[id(701),false]]){
    const c=await iniciar(await receber(await criar({tipo:'consultar_recibo',pedido})));
    const r=await rpc('concluir',{...ref(c),estado:'concluida',resultado:{codigo:'RECIBO_ENCONTRADO',itens:[diag]}});assert.equal(r.recibo_no_servidor,presente);assert.doesNotMatch(JSON.stringify(r),/cpf|senha|aliases|não retornar/);
   }
   assert.equal((await admin('select md5(string_agg(to_jsonb(p)::text,\'\' order by usuario_id,pedido)) h from integracao_pedidos p')).rows[0].h,antes);
  });
  await t.test('re-login do mesmo navegador mantém prova e pode receber com a nova sessão',async()=>{
   const c=await criar();await login(2,id(202));
   const inst=c.args.instalacao_id;await rpc('contatar',{...vinculo(inst),diagnostico_instalacao_id:diagnostico(inst),versao:'novo-login',protocolo:1});
   const consumidor=id(98),alvo={id:c.cmd.id,...vinculo(inst),consumidor};
   const recebido=await rpc('receber',{...vinculo(inst),consumidor});assert.equal(recebido.comando.id,c.cmd.id);assert.doesNotMatch(JSON.stringify(recebido),/prova_instalacao|prova_hash/);assert.ok(!JSON.stringify(recebido).includes(prova(inst)));
   assert.equal((await rpc('autorizar',alvo)).autorizado,true);assert.equal((await rpc('concluir',{...alvo,estado:'concluida',resultado})).aceito,true);await login(2);
  });
  await t.test('TTL vencido antes de executar não libera o comando',async()=>{
   const c=await criar();await admin("update integracao_suporte_privado.solicitacoes set expira_em=clock_timestamp()-interval '1 second' where id=$1",[c.cmd.id]);await login(2);
   assert.equal((await rpc('receber',{...vinculo(c.args.instalacao_id),consumidor:id(60)})).comando,null);assert.equal(await estado(c),'vencida');
   const d=await receber(await criar());await admin("update integracao_suporte_privado.solicitacoes set expira_em=clock_timestamp()-interval '1 second' where id=$1",[d.cmd.id]);assert.deepEqual(await rpc('autorizar',ref(d)),{autorizado:false});assert.equal(await estado(d),'vencida');
  });
  await t.test('lease recebida pode recuperar entrega perdida até o limite sem nova identidade',async()=>{
   let c=await receber(await criar());
   for(let n=0;n<2;n++){await admin("update integracao_suporte_privado.solicitacoes set lease_ate=clock_timestamp()-interval '1 second' where id=$1",[c.cmd.id]);c=await receber(c,id(65+n));assert.equal(c.recebido.id,c.cmd.id);}
   await admin("update integracao_suporte_privado.solicitacoes set lease_ate=clock_timestamp()-interval '1 second' where id=$1",[c.cmd.id]);assert.equal((await rpc('receber',{...vinculo(c.args.instalacao_id),consumidor:id(68)})).comando,null);assert.equal(await estado(c),'negada');
  });
  await t.test('lease iniciada perdida é incerta e nunca redistribuída',async()=>{
   const c=await iniciar(await receber(await criar()));await admin("update integracao_suporte_privado.solicitacoes set lease_ate=clock_timestamp()-interval '1 second' where id=$1",[c.cmd.id]);
   assert.deepEqual(await rpc('validar_execucao',ref(c)),{autorizado:false});assert.equal(await estado(c),'resultado_incerto');
   assert.equal((await rpc('receber',{...vinculo(c.args.instalacao_id),consumidor:id(69)})).comando,null);
   assert.equal((await rpc('concluir',{...ref(c),estado:'concluida',resultado})).aceito,false);assert.equal(await estado(c),'resultado_incerto');
   assert.equal((await admin("select count(*)::int n from integracao_suporte_privado.auditoria where solicitacao_id=$1 and evento='resultado_tardio'",[c.cmd.id])).rows[0].n,1);
  });
  await t.test('cancelamento após início interrompe validações e só arquiva resultado tardio',async()=>{
   const c=await iniciar(await receber(await criar()));await login(1);assert.equal((await rpc('cancelar',{id:c.cmd.id})).estado,'resultado_incerto');await login(2);assert.equal((await rpc('validar_execucao',ref(c))).autorizado,false);
   for(let i=0;i<2;i++)assert.equal((await rpc('concluir',{...ref(c),estado:'concluida',resultado})).aceito,false);
   assert.equal((await admin("select count(*)::int n from integracao_suporte_privado.auditoria where solicitacao_id=$1 and evento='resultado_tardio'",[c.cmd.id])).rows[0].n,1);assert.equal(await estado(c),'resultado_incerto');
   const d=await receber(await criar());await login(1);assert.equal((await rpc('cancelar',{id:d.cmd.id})).estado,'cancelada');await login(2);assert.equal((await rpc('autorizar',ref(d))).autorizado,false);
  });
  await t.test('revogação do operador ou de sua sessão invalida comando pendente/iniciado',async()=>{
   const c=await iniciar(await receber(await criar()));await admin('update profiles set ativo=false where id=$1',[id(1)]);assert.equal((await rpc('validar_execucao',ref(c))).autorizado,false);assert.equal(await estado(c),'resultado_incerto');await admin('update profiles set ativo=true where id=$1',[id(1)]);
   const d=await receber(await criar());await admin('delete from auth.sessions where id=$1',[id(101)]);assert.equal((await rpc('autorizar',ref(d))).autorizado,false);assert.equal(await estado(d),'negada');await admin('insert into auth.sessions values($1,$2,null)',[id(101),id(1)]);
   const e=await iniciar(await receber(await criar()));await admin('update integracao_suporte_privado.config set habilitado=false');await assert.rejects(rpc('validar_execucao',ref(e)),{code:'42501'});await login(1);assert.equal((await rpc('listar')).solicitacoes.find(x=>x.id===e.cmd.id).estado,'resultado_incerto');await admin('update integracao_suporte_privado.config set habilitado=true');
  });
  await t.test('sessão do alvo revogada ou expirada não executa nem conclui',async()=>{
   const c=await receber(await criar());await admin("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[id(102)]);await assert.rejects(rpc('autorizar',ref(c)),{code:'42501'});await admin('update auth.sessions set not_after=null where id=$1',[id(102)]);
   await iniciar(c);await login(2,id(202));await assert.rejects(rpc('validar_execucao',ref(c)),{code:'42501'});await assert.rejects(rpc('concluir',{...ref(c),estado:'concluida',resultado}),{code:'42501'});await login(2);await rpc('concluir',{...ref(c),estado:'negada',resultado:{codigo:'REVISAO_NECESSARIA',itens:[]}});
  });
  await t.test('reversão preserva comandos, auditoria e recibos; encerra canal sem apagar filas',async()=>{
   const aguardando=await criar(),iniciada=await iniciar(await receber(await criar()));
   const antes=(await admin('select count(*)::int n from integracao_suporte_privado.auditoria')).rows[0].n;
   await assert.rejects(admin("update integracao_suporte_privado.auditoria set evento='criada'"),{code:'42501'});await assert.rejects(admin('delete from integracao_suporte_privado.auditoria'),{code:'42501'});
   await db.exec('reset role');await db.exec(read('../supabase/operacoes/suporte-remoto-desativar.sql'));await login(1);
   await assert.rejects(rpc('capacidade'),{code:'42501'});
   assert.equal(await estado(aguardando),'cancelada');assert.equal(await estado(iniciada),'resultado_incerto');
   assert.ok((await admin('select count(*)::int n from integracao_suporte_privado.auditoria')).rows[0].n>antes);
   assert.equal((await admin('select count(*)::int n from public.integracao_pedidos')).rows[0].n,2);
   assert.equal((await admin('select habilitado from integracao_suporte_privado.config')).rows[0].habilitado,false);
  });
 }finally{await db.close();}
});
