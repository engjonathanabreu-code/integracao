import test from 'node:test';import assert from 'node:assert/strict';import {validarOficio,respostaOficioIA} from '../src/oficios-regras.js';
import {admin,func,banco,como,rpc,arquivo} from './oficios-db-fixture.js';
test('ofícios: primeiro número confirmado, sequência anual, idempotência e duplicatas sem consumir número',async()=>{const db=await banco();try{const d=await arquivo(db);const r=await rpc(db,admin,d);assert.equal(r.numero,42);assert.equal(r.ano,2025);assert.equal((await rpc(db,admin,d)).id,r.id);assert.equal((await rpc(db,admin,await arquivo(db,43))).numero,43);
 await assert.rejects(()=>rpc(db,admin,{...d,pedido:crypto.randomUUID()}),/Envie o arquivo/);
 const repetido=await arquivo(db,44,'2025-01-11',d.sha256);await assert.rejects(()=>rpc(db,admin,repetido),/já está cadastrado/);
 assert.equal((await db.query('select ultimo from integracao_oficios_sequencias where ano=2025')).rows[0].ultimo,43);
 await assert.rejects(async()=>rpc(db,admin,{...await arquivo(db,43)}),/sequência foi atualizada/);
 assert.equal((await rpc(db,admin,await arquivo(db,1,'2026-01-01'))).numero,1);
 const invalido=await arquivo(db,44);invalido.assunto='';await assert.rejects(()=>rpc(db,admin,invalido));assert.equal((await db.query('select ultimo from integracao_oficios_sequencias where ano=2025')).rows[0].ultimo,43);
 }finally{await db.close();}});
test('ofícios: perfis, arquivos privados e escritas somente pela operação autorizada',async()=>{const db=await banco();try{const d=await arquivo(db);await assert.rejects(()=>rpc(db,func,d),/Sem permissão/);await rpc(db,admin,d);assert.equal((await como(db,func,'select * from integracao_oficios')).length,1);
 await assert.rejects(()=>como(db,func,"update integracao_oficios_sequencias set ultimo=1"));await assert.rejects(()=>como(db,func,"delete from integracao_oficios"));
 await assert.rejects(()=>como(db,func,"insert into storage.objects values('integracao-oficios',$1)",[`${func}/${crypto.randomUUID()}/oficio.pdf`]));
 assert.equal((await como(db,func,"select * from storage.objects where bucket_id='integracao-oficios'")).length,1);
 await db.exec(`update profiles set ativo=false where id='${func}'`);assert.equal((await como(db,func,'select * from integracao_oficios')).length,0);
 }finally{await db.close();}});
test('validar arquivos e respostas IA sem inventar numeração',()=>{assert.equal(validarOficio({name:'OFICIO.PDF',size:100}).mime,'application/pdf');assert.throws(()=>validarOficio({name:'antigo.doc',size:10}),/exporte/);assert.throws(()=>validarOficio({name:'grande.pdf',size:11000000}),/10 MB/);const r=respostaOficioIA('```json\n{"resumo":"Solicita análise do processo.","numero":null,"ano":null}\n```');assert.equal(r.numero,null);assert.throws(()=>respostaOficioIA('{}'),/resumo válido/);});

test('ofícios: Projeto, Jurídico, diretores e setor canônico podem anexar e registrar; inativos não',async()=>{
 const db=await banco();try{
 let numero=1;
 for(const [tipo,setor] of [['Projetos','Projetos'],['Jurídico','Jurídico'],['Diretor Técnico','Topografia'],['Diretor de Projetos','Projetos'],['Topografia','Projetos']]){
  await db.query('update profiles set tipo=$1,setor=$2 where id=$3',[tipo,setor,func]);
  const d=await arquivo(db,numero++);d.caminho=d.caminho.replace(admin,func);
  await como(db,func,"insert into storage.objects values('integracao-oficios',$1)",[d.caminho]);
  assert.equal((await rpc(db,func,d)).autor,func);
  await assert.rejects(()=>como(db,func,"insert into storage.objects values('integracao-oficios',$1)",[`${admin}/${crypto.randomUUID()}/oficio.pdf`]));
 }
 await db.query('update profiles set ativo=false where id=$1',[func]);
 await assert.rejects(()=>rpc(db,func,{}),/Sessão ativa/);
 await assert.rejects(()=>como(db,func,"insert into storage.objects values('integracao-oficios',$1)",[`${func}/${crypto.randomUUID()}/oficio.pdf`]));
 }finally{await db.close();}
});
