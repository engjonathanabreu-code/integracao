import test from 'node:test';import assert from 'node:assert/strict';
import emails from '../api/calendario-emails.js';import resumo from '../api/calendario-resumo.js';
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
async function fixture(fn,{habilitado=true}={}){
 const oldFetch=global.fetch,vars=['ERP_SERVICE_ROLE_KEY','RESEND_API_KEY','CRON_SECRET'],old=Object.fromEntries(vars.map(k=>[k,process.env[k]]));vars.forEach(k=>process.env[k]='fixture-only');
 const rows=new Map(),calls=[];let sends=0;
 const evento={id:'00000000-0000-4000-8000-000000000001',titulo:'Reunião sintética',inicio:'2026-11-10T13:00:00Z',fim:'2026-11-10T14:00:00Z',status:'ativo',participantes:[]};
 global.fetch=async(input,o={})=>{
  const u=new URL(input),name=u.pathname.split('/').at(-1),p=o.body?JSON.parse(o.body):{};calls.push(name);
  if(u.hostname==='api.resend.com'){sends++;assert.ok(o.headers['Idempotency-Key']);await new Promise(r=>setTimeout(r,5));return Response.json({id:'fixture-receipt'});}
  if(name==='integracao_envios_config')return Response.json({habilitado,protocolo:2,corte:'2026-11-10T00:00:00Z'});
  if(name==='integracao_envios_pendentes')return Response.json([{id:1,email:'test@example.invalid',nome:'Teste',tipo:'convite',sequencia:0,evento,criado_em:'2026-11-10T12:00:00Z'}]);
  if(name==='integracao_calendario_resumo')return Response.json([{email:'test@example.invalid',nome:'Teste',eventos:[evento]}]);
  if(name==='integracao_envios_enfileirar'){if(!rows.has(p.p_chave))rows.set(p.p_chave,{id:p.p_chave,chave:p.p_chave,estado:'pendente',corpo:p.p_corpo});return Response.json(rows.get(p.p_chave));}
  if(name==='integracao_envios_claim'){const r=rows.get(p.p_id);if(r.estado!=='pendente')return Response.json(null);r.estado='enviando';return Response.json({...r,lease:'fixture-lease',tentativa:1});}
  if(name==='integracao_envios_finalizar'){const r=rows.get(p.p_id);r.estado=p.p_estado;return Response.json({estado:r.estado});}
  throw Error('Chamada não prevista: '+name);
 };
 try{await fn({calls,sends:()=>sends});}finally{global.fetch=oldFetch;for(const k of vars)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
}
const req=method=>({method,headers:{authorization:'Bearer fixture-only',host:'fixture.invalid'}});
test('rota de convites simultânea confirma apenas um envio fictício',()=>fixture(async f=>{const a=response(),b=response();await Promise.all([emails(req('POST'),a),emails(req('POST'),b)]);assert.equal(a.code,200);assert.equal(b.code,200);assert.equal(f.sends(),1);}));
test('resumo diário repetido deduplica e nunca drena convites',()=>fixture(async f=>{await resumo(req('GET'),response());await resumo(req('GET'),response());assert.equal(f.sends(),1);assert.ok(!f.calls.includes('integracao_envios_pendentes'));}));
test('configuração desabilitada não lista backlog nem envia',()=>fixture(async f=>{const a=response();await emails(req('POST'),a);await resumo(req('GET'),response());assert.equal(a.body.estado,'desativado');assert.equal(f.sends(),0);assert.deepEqual(f.calls,['integracao_envios_config','integracao_envios_config']);},{habilitado:false}));
