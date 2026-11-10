import test from 'node:test';import assert from 'node:assert/strict';
import {entregarOutbox,chaveResumo} from '../server/calendario-outbox.js';
import {enviarCorpoEmail} from '../api/_calendario.js';
const setup=()=>{
 let row=null;
 const rpc=async(name,p)=>{
  if(name.endsWith('enfileirar')){if(row&&JSON.stringify(row.corpo)!==JSON.stringify(p.p_corpo))throw Error('payload mismatch');row||={id:'fixture-item',chave:p.p_chave,corpo:p.p_corpo,estado:'pendente',tentativa:0};return {id:row.id,estado:row.estado};}
  if(name.endsWith('claim')){if(row.estado!=='pendente')return null;row.estado='enviando';row.lease='fixture-lease';row.tentativa++;return {...row};}
  assert.equal(p.p_lease,row.lease);row.estado=p.p_estado;row.recibo=p.p_recibo;return {estado:row.estado};
 };
 return {rpc,row:()=>row};
};
const options={chave:'convite/1/0',origem:'convite',fila:1,corpo:{to:['fixture@example.invalid'],subject:'Teste'}};
test('dois consumidores concorrentes enviam uma única vez e preservam recibo',async()=>{
 const db=setup();let calls=0;
 const enviar=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return 'fixture-receipt';};
 await Promise.all([entregarOutbox({...options,rpc:db.rpc,enviar}),entregarOutbox({...options,rpc:db.rpc,enviar})]);
 assert.equal(calls,1);assert.equal(db.row().estado,'enviado');assert.equal(db.row().recibo,'fixture-receipt');
 await entregarOutbox({...options,rpc:db.rpc,enviar});assert.equal(calls,1);
});
test('timeout depois do aceite preserva incerteza e não reenvia',async()=>{
 const db=setup();let calls=0;const enviar=async()=>{calls++;throw new TypeError('resposta perdida');};
 await entregarOutbox({...options,rpc:db.rpc,enviar});await entregarOutbox({...options,rpc:db.rpc,enviar});
 assert.equal(calls,1);assert.equal(db.row().estado,'incerto');
});
test('falha ao persistir recibo não reinicia o envio',async()=>{
 const db=setup();let calls=0;const rpc=(n,p)=>n.endsWith('finalizar')?Promise.reject(Error('rede')):db.rpc(n,p);
 await assert.rejects(()=>entregarOutbox({...options,rpc,enviar:async()=>{calls++;return 'fixture-receipt';}}));
 assert.equal(db.row().estado,'enviando');await entregarOutbox({...options,rpc:db.rpc,enviar:async()=>{calls++;}});assert.equal(calls,1);
});
test('429 permanece pendente, enquanto recusas determinísticas bloqueiam',async()=>{
 for(const [status,estado] of [[429,'pendente'],[403,'bloqueado'],[500,'incerto']]){const db=setup();await entregarOutbox({...options,rpc:db.rpc,enviar:async()=>{throw Object.assign(Error('fixture'),{status,retryAfter:90});}});assert.equal(db.row().estado,estado);}
});
test('deadline esgotado não faz claim nem envio',async()=>{let calls=0;assert.equal((await entregarOutbox({...options,rpc:async()=>{calls++;},enviar:async()=>{calls++;},deadline:Date.now()})).estado,'adiado');assert.equal(calls,0);});
test('resumo usa destinatário/dia/fuso e chave opaca',()=>{assert.equal(chaveResumo(' A@EXAMPLE.INVALID ','2026-11-10'),chaveResumo('a@example.invalid','2026-11-10'));assert.notEqual(chaveResumo('a@example.invalid','2026-11-10'),chaveResumo('a@example.invalid','2026-11-11'));assert.ok(!chaveResumo('a@example.invalid','2026-11-10').includes('@'));});
test('provedor recebe chave idempotente e nunca tem mensagem privada propagada',async()=>{
 const old=global.fetch,key=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='fixture-only';let seen;
 global.fetch=async(u,o)=>{seen=o;return Response.json({message:'private fixture'},{status:429,headers:{'Retry-After':'90'}});};
 try{await assert.rejects(()=>enviarCorpoEmail(options.corpo,options.chave),e=>e.status===429&&e.retryAfter===90&&!e.message.includes('private'));assert.equal(seen.headers['Idempotency-Key'],options.chave);}finally{global.fetch=old;if(key===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=key;}
});
