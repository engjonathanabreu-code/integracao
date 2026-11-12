// Optional, explicit integration check. Never uses PGHOST/PGDATABASE, a default
// socket, existing cluster or Supabase. Missing PostgreSQL is an error, not skip.
// Run explicitly: SUPORTE_PG_BIN=/path/to/postgresql/bin node scripts/verificar-suporte-postgres.mjs
// This is intentionally outside npm test/CI: it needs local PostgreSQL binaries.
// Artifacts remain in an owner-only temporary directory; the cluster is stopped in finally.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {access,mkdtemp,mkdir,readFile,writeFile,chmod,stat} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';

const app=fileURLToPath(new URL('../',import.meta.url));
const bin=resolve(process.env.SUPORTE_PG_BIN||'/tmp/integracao-pg17/bin');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sqlString=s=>"'"+String(s).replaceAll("'","''")+"'";
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
Object.assign(env,{PGCONNECT_TIMEOUT:'3',PGTZ:'UTC',PGAPPNAME:'integracao-suporte-fixture',LC_ALL:'C'});
const children=new Set();let interrupted=false;
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{interrupted=true;for(const child of children)child.kill('SIGTERM');});
function launch(name,args,{input='',keepOpen=false,cleanup=false}={}){
 if(interrupted&&!cleanup)throw Error('Teste interrompido.');
 const child=spawn(join(bin,name),args,{env,stdio:['pipe','pipe','pipe']});children.add(child);
 let stdout='',stderr='';const jsons=[];let firstResolve,firstReject;
 const firstJson=new Promise((r,j)=>{firstResolve=r;firstReject=j;});firstJson.catch(()=>{});
 let pending='';
 child.stdout.on('data',b=>{stdout+=b;pending+=b;for(;;){const end=pending.indexOf('\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+1);try{const o=JSON.parse(line);jsons.push(o);if(o&&typeof o==='object'&&Object.hasOwn(o,'resultado'))firstResolve(o);}catch{}}});
 child.stderr.on('data',b=>{stderr+=b;});
 let timeout=false;const timer=setTimeout(()=>{timeout=true;child.kill('SIGTERM');},30000);
 const result=new Promise((done,reject)=>{
  child.on('error',e=>{clearTimeout(timer);children.delete(child);firstReject(e);reject(e);});
  child.on('close',code=>{clearTimeout(timer);children.delete(child);if(code!==0){const e=Error(`${name} falhou (${timeout?'timeout':code}); o roteiro usa somente fixtures locais.`);firstReject(e);reject(e);}else{firstReject(Error('Processo terminou sem resposta de RPC.'));done({stdout,stderr,jsons,code});}});
 });
 result.catch(()=>{});child.stdin.on('error',()=>{});if(keepOpen)child.stdin.write(input);else child.stdin.end(input);
 return {child,result,firstJson};
}
const run=async(name,args,options)=>(await launch(name,args,options).result).stdout;
async function freePort(){const server=createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const {port}=server.address();await new Promise((r,j)=>server.close(e=>e?j(e):r()));return port;}
function parseJson(output){const rows=output.trim().split(/\r?\n/).filter(Boolean);for(let n=rows.length-1;n>=0;n--)try{return JSON.parse(rows[n]);}catch{}throw Error('Resposta JSON da fixture não encontrada.');}

let root,data,socket,port,report,failed;
try{
 for(const name of ['initdb','postgres','pg_ctl','psql','pg_dump','pg_restore'])try{await access(join(bin,name));}catch{throw Error('PostgreSQL local não encontrado. Defina SUPORTE_PG_BIN para o diretório de binários. Este roteiro opcional falhou; não foi ignorado.');}
 root=await mkdtemp('/tmp/integracao-suporte-pg-');await chmod(root,0o700);data=join(root,'cluster');socket=join(root,'socket');await mkdir(socket,{mode:0o700});port=await freePort();
 await run('initdb',['-D',data,'-A','trust','-U','suporte_fixture','--no-locale','-E','UTF8']);
 await run('pg_ctl',['start','-D',data,'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${socket}`,'-w','-t','20']);
 const conn=db=>['-h',socket,'-p',String(port),'-U','suporte_fixture','-d',db,'-w'];
 const psqlArgs=db=>[...conn(db),'-X','-qAt','-v','ON_ERROR_STOP=1'];
 const sql=(db,text)=>run('psql',psqlArgs(db),{input:text});
 const ownDir=(await sql('postgres',"select current_setting('data_directory');")).trim();assert.equal(resolve(ownDir),data,'Não conectar a um cluster existente.');
 await sql('postgres','create role authenticated;create role anon;create role service_role;create database suporte_origem;create database suporte_restaurado;');
 const fixture=`create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table profiles(id uuid primary key,nome text,ativo boolean,tipo text);
 create table integracao_pedidos(usuario_id uuid,pedido uuid,resultado jsonb,primary key(usuario_id,pedido));
 create table integracao_sincronizacao_dispositivos(usuario_id uuid,instalacao_id uuid,versao text,ultimo_contato timestamptz,resumo jsonb);
 insert into profiles values(${sqlString(id(1))},'Operador fixture',true,'Administrador'),(${sqlString(id(2))},'Alvo fixture',true,'Topografia'),(${sqlString(id(3))},'Outro administrador fixture',true,'Administrador');
 insert into auth.sessions values(${sqlString(id(101))},${sqlString(id(1))},null),(${sqlString(id(102))},${sqlString(id(2))},null),(${sqlString(id(103))},${sqlString(id(3))},null);
 insert into integracao_pedidos values(${sqlString(id(2))},${sqlString(id(700))},'{"aliases":{},"fixture":true}');`;
 await sql('suporte_origem',fixture);
 const beforeReceipts=(await sql('suporte_origem',"select md5(string_agg(to_jsonb(p)::text,'' order by usuario_id,pedido)) from public.integracao_pedidos p;")).trim();
 const migrationPath=join(app,'supabase/migrations/20261112190126_suporte_remoto_exclusivo.sql');await sql('suporte_origem',await readFile(migrationPath,'utf8'));
 assert.equal((await sql('suporte_origem',"select (not habilitado and operador is null)::text from integracao_suporte_privado.config;")).trim(),'true');
 await sql('suporte_origem',`update integracao_suporte_privado.config set operador=${sqlString(id(1))},habilitado=true;`);
 const claims=n=>`begin;set local role authenticated;set local "request.jwt.claim.sub"=${sqlString(id(n))};set local "request.jwt.claims"=${sqlString(JSON.stringify({sub:id(n),session_id:id(100+n)}))};\n`;
 const call=(acao,args)=>`public.integracao_suporte_operar(${sqlString(acao)},${sqlString(JSON.stringify(args))}::jsonb)`;
 const rpc=async(n,acao,args={},db='suporte_origem')=>parseJson(await sql(db,claims(n)+`select ${call(acao,args)};commit;`));
 const proofs=new Map(),proof=inst=>{if(!proofs.has(inst))proofs.set(inst,randomBytes(32).toString('hex'));return proofs.get(inst);};
 const reference=(inst,consumidor,command)=>({instalacao_id:inst,consumidor,id:command,prova_instalacao:proof(inst)});
 const contact=inst=>rpc(2,'contatar',{instalacao_id:inst,diagnostico_instalacao_id:id(2000+Number(inst.slice(-12))),prova_instalacao:proof(inst),versao:'fixture-suporte-v1',protocolo:1});
 const request=async(inst,command,tipo='diagnostico',pedido=null)=>{await contact(inst);return rpc(1,'solicitar',{id:command,atendimento:id(600),usuario_id:id(2),instalacao_id:inst,tipo,pedido});};
 const command=id(40),installation=id(20),consumerA=id(50),consumerB=id(51);
 await request(installation,command,'reler_confirmacao',id(700));
 // Keep connection A's transaction open after it acquires the command. B runs
 // before A is allowed to commit, proving real SKIP LOCKED isolation.
 const claimA={instalacao_id:installation,consumidor:consumerA,prova_instalacao:proof(installation)};
 const a=launch('psql',psqlArgs('suporte_origem'),{keepOpen:true,input:claims(2)+`select jsonb_build_object('backend',pg_backend_pid(),'resultado',${call('receber',claimA)});\n`});
 const first=await a.firstJson;assert.equal(first.resultado.comando.id,command);
 const b=parseJson(await sql('suporte_origem',claims(2)+`select jsonb_build_object('backend',pg_backend_pid(),'resultado',${call('receber',{...claimA,consumidor:consumerB})});commit;`));
 assert.notEqual(first.backend,b.backend,'São necessárias duas conexões PostgreSQL distintas.');assert.equal(b.resultado.comando,null);assert.equal(a.child.exitCode,null,'A deve continuar com a transação aberta enquanto B responde.');
 a.child.stdin.end('commit;\n');await a.result;
 const ref=reference(installation,consumerA,command);
 const authorizations=await Promise.all([rpc(2,'autorizar',ref),rpc(2,'autorizar',ref)]);assert.equal(authorizations.filter(x=>x.autorizado===true).length,1);assert.equal(authorizations.filter(x=>x.autorizado===false).length,1);
 assert.equal((await rpc(2,'validar_execucao',ref)).autorizado,true);
 assert.equal((await rpc(2,'concluir',{...ref,estado:'concluida',resultado:{codigo:'LEITURA_CONFIRMADA',itens:[]}})).recibo_no_servidor,true);
 // Include one waiting and one started command in the recoverability/rollback check.
 await request(id(22),id(42));await request(id(24),id(44));
 const activeRef=reference(id(24),id(54),id(44));await rpc(2,'receber',{instalacao_id:id(24),consumidor:id(54),prova_instalacao:proof(id(24))});assert.equal((await rpc(2,'autorizar',activeRef)).autorizado,true);
 const snapshotSQL=`select jsonb_build_object(
 'comandos',(select md5(string_agg(to_jsonb(s)::text,'' order by id)) from integracao_suporte_privado.solicitacoes s),
 'quantidade_comandos',(select count(*) from integracao_suporte_privado.solicitacoes),
 'auditoria',(select md5(string_agg(to_jsonb(a)::text,'' order by id)) from integracao_suporte_privado.auditoria a),
 'quantidade_auditoria',(select count(*) from integracao_suporte_privado.auditoria),
 'hashes_provas',(select md5(string_agg(encode(prova_hash,'hex'),'' order by usuario_id,instalacao_id)) from integracao_suporte_privado.dispositivos),
 'config',(select md5(to_jsonb(c)::text) from integracao_suporte_privado.config c),
 'funcoes',(select md5(string_agg(pg_get_functiondef(p.oid),'' order by proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p where p.pronamespace='integracao_suporte_privado'::regnamespace),
 'wrapper',(select md5(pg_get_functiondef(p.oid)||p.proacl::text) from pg_proc p where p.oid='public.integracao_suporte_operar(text,jsonb)'::regprocedure));`;
 const snapshot=parseJson(await sql('suporte_origem',snapshotSQL));
 const backup=join(root,'suporte-objetos.dump'),wrapperFile=join(root,'suporte-wrapper.sql');
 await run('pg_dump',[...conn('suporte_origem'),'--format=custom','--schema=integracao_suporte_privado','--strict-names','--file',backup]);await chmod(backup,0o600);
 const wrapper=await sql('suporte_origem',"select pg_get_functiondef('public.integracao_suporte_operar(text,jsonb)'::regprocedure);");
 await writeFile(wrapperFile,wrapper.trimEnd()+`;\nrevoke all on function public.integracao_suporte_operar(text,jsonb) from public,anon,authenticated,service_role;\ngrant execute on function public.integracao_suporte_operar(text,jsonb) to authenticated;\n`,{mode:0o600});
 await sql('suporte_restaurado',fixture);await run('pg_restore',[...conn('suporte_restaurado'),'--exit-on-error','--single-transaction',backup]);await sql('suporte_restaurado',await readFile(wrapperFile,'utf8'));
 const restored=parseJson(await sql('suporte_restaurado',snapshotSQL));assert.deepEqual(restored,snapshot,'Objetos, comandos, auditoria, configuração, funções e hashes de prova devem sobreviver ao restore.');
 assert.deepEqual(await rpc(1,'capacidade',{},'suporte_restaurado'),{operador:true,habilitado:true});assert.equal((await rpc(3,'capacidade',{},'suporte_restaurado')).operador,false);
 const auditMax=(await sql('suporte_origem','select max(id) from integracao_suporte_privado.auditoria;')).trim();
 const auditOriginal=(await sql('suporte_origem',`select md5(string_agg(to_jsonb(a)::text,'' order by id)) from integracao_suporte_privado.auditoria a where id<=${Number(auditMax)};`)).trim();
 await sql('suporte_origem',await readFile(join(app,'supabase/operacoes/suporte-remoto-desativar.sql'),'utf8'));
 const rollback=parseJson(await sql('suporte_origem',`select jsonb_build_object('habilitado',(select habilitado from integracao_suporte_privado.config),'comandos',(select count(*) from integracao_suporte_privado.solicitacoes),'auditoria',(select count(*) from integracao_suporte_privado.auditoria),'aguardando',(select estado from integracao_suporte_privado.solicitacoes where id=${sqlString(id(42))}),'iniciada',(select estado from integracao_suporte_privado.solicitacoes where id=${sqlString(id(44))}),'rpc_authenticated',has_function_privilege('authenticated','public.integracao_suporte_operar(text,jsonb)','EXECUTE'));`));
 assert.equal(rollback.habilitado,false);assert.equal(rollback.comandos,snapshot.quantidade_comandos);assert.ok(rollback.auditoria>snapshot.quantidade_auditoria);assert.equal(rollback.aguardando,'cancelada');assert.equal(rollback.iniciada,'resultado_incerto');assert.equal(rollback.rpc_authenticated,false);
 assert.equal((await sql('suporte_origem',`select md5(string_agg(to_jsonb(a)::text,'' order by id)) from integracao_suporte_privado.auditoria a where id<=${Number(auditMax)};`)).trim(),auditOriginal);
 assert.equal((await sql('suporte_origem',"select md5(string_agg(to_jsonb(p)::text,'' order by usuario_id,pedido)) from public.integracao_pedidos p;")).trim(),beforeReceipts);
 // Catch permission denial inside this local fixture without printing arguments,
 // the proof, or a libpq/SQL error containing request data.
 const denied=parseJson(await sql('suporte_origem',claims(1)+`do $$begin begin perform public.integracao_suporte_operar('capacidade','{}');raise exception 'RPC indevidamente disponível';exception when insufficient_privilege then null;end;end$$;select '{"negada":true}'::jsonb;commit;`));assert.equal(denied.negada,true);
 report={ok:true,verificadoEm:new Date().toISOString(),postgres:(await run('postgres',['--version'])).trim(),clusterNovoIsolado:true,duasConexoesReais:true,apenasUmaRecebeu:true,autorizacaoUnica:true,backupFixtures:true,backupProducao:false,restoreSegundoBanco:true,comandosPreservados:true,auditoriaPreservada:true,hashesProvasPreservados:true,recibosIntactos:true,reversaoTestada:true,rpcNegadaAposReversao:true,producaoAcessada:false,
  artefatos:{pasta:root,backup,wrapper:wrapperFile,backupBytes:(await stat(backup)).size,sha256Backup:createHash('sha256').update(await readFile(backup)).digest('hex')},
  limite:'Backup e restore de fixtures e objetos novos, com dependências anteriores previamente criadas no segundo banco. Não é backup de produção nem recuperação de aparelhos reais.'};
}catch(e){failed=e;report={ok:false,erro:e.message,producaoAcessada:false,artefatos:root?{pasta:root}:null};}
finally{
 // No recursive deletion. Always address only the newly-created data directory;
 // stop even if pg_ctl start timed out after the server had actually started.
 if(data){try{await access(join(data,'postmaster.pid'));await run('pg_ctl',['stop','-D',data,'-m','fast','-w','-t','20'],{cleanup:true});report.clusterEncerrado=true;}catch(e){try{await access(join(data,'postmaster.pid'));report.clusterEncerrado=false;report.ok=false;report.erro='Não foi possível confirmar encerramento do cluster exclusivo.';failed??=Error(report.erro);}catch{report.clusterEncerrado=true;}}}
 if(root){await writeFile(join(root,'resultado.json'),JSON.stringify(report,null,2),{mode:0o600});}
}
console.log(JSON.stringify(report,null,2));if(failed||report?.clusterEncerrado!==true)process.exitCode=1;
