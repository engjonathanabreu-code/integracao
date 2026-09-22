import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepararBanco} from './crm-schema.test.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const arr=ns=>`array[${ns.map(n=>`'${id(n)}'`).join(',')}]::uuid[]`;
const read=p=>readFileSync(new URL('../supabase/'+p,import.meta.url),'utf8');
async function como(db,n,sql){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return (await db.query(sql)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
async function preparar(){const db=await prepararBanco();await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;alter table integracao_moradores add primary key(colecao,registro_id);insert into profiles values('${id(7)}','Cris','Comercial',true),('${id(8)}','Inativo','Comercial',false);insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(31)}','Primeira','${id(30)}','TAI01');`);for(const f of ['crm-leads.sql','crm-lead-responsavel.sql','crm-carregamento.sql'])await db.exec(read('operacoes/'+f));await db.exec(read('migrations/20260922162925_crm_multiplos_comerciais.sql'));return db;}
const criar=(card=70,users=[2,3])=>`select integracao_crm_cadastrar_lead_compartilhado('${id(card)}','Lead ${card}','4899999${String(card).padStart(4,'0')}','${id(30)}',${arr(users)}) id`;
const definir=(card,novos,antes)=>`select integracao_crm_definir_comerciais('${id(card)}',${arr(novos)},${arr(antes)})`;
const ver=card=>`select * from integracao_crm_funil where id='${id(card)}'`;
test('lead compartilhado: acesso, remoção, auditoria, conflitos e proteção contra PATCH',async()=>{const db=await preparar();try{
 assert.equal((await como(db,2,criar()))[0].id,id(70));assert.equal((await como(db,2,criar()))[0].id,id(70));
 for(const u of [1,2,3])assert.deepEqual((await como(db,u,ver(70)))[0].responsaveis_ids,[id(2),id(3)]);
 for(const u of [4,5,6,7,8])assert.equal((await como(db,u,ver(70))).length,0);
 await como(db,2,`insert into integracao_crm_atendimentos(card_id,autor_id,relato,data) values('${id(70)}','${id(2)}','Histórico compartilhado',now())`);
 assert.equal((await como(db,3,`select * from integracao_crm_atendimentos where card_id='${id(70)}'`)).length,1);
 assert.equal((await como(db,3,`update integracao_crm_cards set status='Negociação' where id='${id(70)}' returning id`)).length,1);
 for(const campo of ['responsavel_id','comerciais_adicionais'])await assert.rejects(()=>como(db,3,`update integracao_crm_cards set ${campo}=${campo} where id='${id(70)}'`),/permission denied/);
 await assert.rejects(()=>como(db,7,definir(70,[2,3,7],[2,3])),/Sem permissão/);
 for(const users of [[],[6],[8]])await assert.rejects(()=>como(db,2,definir(70,users,[2,3])));
 await como(db,3,definir(70,[3],[2,3]));assert.equal((await como(db,2,ver(70))).length,0);assert.equal((await como(db,2,`select * from integracao_crm_atendimentos where card_id='${id(70)}'`)).length,0);
 await assert.rejects(()=>como(db,2,definir(70,[2,3],[3])),/Sem permissão/);
 await assert.rejects(()=>como(db,1,definir(70,[2,3,7],[2,3])),/responsáveis mudaram/);
 await como(db,3,definir(70,[3,7],[3]));assert.equal((await como(db,7,ver(70))).length,1);
 await db.exec(`update profiles set ativo=false where id='${id(7)}'`);assert.equal((await como(db,7,ver(70))).length,0);
 await como(db,1,`select integracao_crm_transferir('${id(70)}','${id(2)}')`);assert.equal((await como(db,3,ver(70))).length,0);assert.deepEqual((await como(db,2,ver(70)))[0].responsaveis_ids,[id(2)]);
 assert.ok((await como(db,1,`select * from integracao_crm_auditoria where registro_id='${id(70)}' and acao='UPDATE'`)).length>=3);
 await db.exec('set role anon');await assert.rejects(()=>db.query(criar(71)));await db.exec('reset role');
 }finally{await db.close();}});
test('cadastro atômico, repetição segura, conversão e união de responsáveis no vínculo',async()=>{const db=await preparar();try{
 await assert.rejects(()=>como(db,2,criar(71,[2,6])));assert.equal((await db.query(`select id from integracao_crm_cards where id='${id(71)}'`)).rows.length,0);
 await como(db,1,criar());const prev={status:'Cliente novo',valor_total:null,forma_negociacao:null,parcelas:null,desconto_percentual:null,entrada_percentual:null};const next={...prev,status:'Contrato'};
 const cliente=(await como(db,3,`select integracao_crm_converter_lead('${id(70)}','${id(30)}','${id(31)}','${JSON.stringify(next)}','${JSON.stringify(prev)}') id`))[0].id;
 assert.deepEqual((await como(db,3,ver(70)))[0].responsaveis_ids,[id(2),id(3)]);
 await assert.rejects(()=>como(db,1,definir(70,[2],[2,3])),/ainda é um lead/);
 await como(db,1,criar(72,[3,7]));await como(db,3,`select integracao_crm_vincular('${id(72)}','${cliente}')`);
 assert.equal((await como(db,7,ver(70))).length,1);assert.deepEqual((await como(db,1,ver(70)))[0].responsaveis_ids.sort(),[id(2),id(3),id(7)]);
 assert.deepEqual((await como(db,1,ver(72)))[0].responsaveis_ids,[]);
 await como(db,2,criar(73,[2,3]));await como(db,2,definir(73,[2],[2,3]));await como(db,2,criar(73,[2,3]));assert.deepEqual((await como(db,2,ver(73)))[0].responsaveis_ids,[id(2)],'retry does not restore removed users');
 }finally{await db.close();}});
