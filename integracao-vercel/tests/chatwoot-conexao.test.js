import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepararBanco} from './crm-schema.test.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('identidade exige telefone e dados exatos, preserva cadastro e nunca confirma outros contatos',async()=>{
 const db=await prepararBanco();try{
  await db.exec(readFileSync(new URL('../supabase/migrations/20260919182005_chatwoot_ia_conexao.sql',import.meta.url),'utf8'));
  await db.exec(`alter table fin_receb_municipios add column prefixo text; update fin_receb_municipios set prefixo='TAI';
   update fin_receb_clientes set nome='TAI - José da Silva',codigo='TAI01_20',municipio_id='${id(30)}',cpf_cnpj='52998224725';
   insert into integracao_moradores values('processos','${id(20)}','${id(20)}','{"nucleoId":"${id(40)}","requerente":{"telefone":"(47) 99999-0000"}}');
   insert into integracao_nucleo_ia values('${id(40)}','Somente informações autorizadas',true);
   insert into processos_kanban_andamentos(processo_id,descricao_cliente,observacao_interna,visivel_ia,data_atualizacao) values('${id(40)}','Atualização pública','SEGREDO',true,'2026-09-19'),('${id(40)}','OCULTO','SEGREDO',false,'2026-09-20');`);
  const before=(await db.query('select to_jsonb(c) registro from fin_receb_clientes c')).rows;
  const event={instalacao:'chat.test',conta_id:1,conversa_id:10,contato_id:20,nome:'José',telefone:'+5547999990000',mensagem_id:30,conteudo:'Olá',data:'2026-09-19T12:00:00Z'};
  await db.query('select integracao_crm_receber($1)',[event]);await db.query('select integracao_crm_receber($1)',[event]);
  assert.equal((await db.query('select count(*) n from integracao_crm_mensagens')).rows[0].n,1);
  const identify=async(nome,cidade,doc='')=>(await db.query("select integracao_crm_identificar('chat.test',1,10,$1,$2,$3) r",[nome,cidade,doc])).rows[0].r;
  assert.equal((await identify('José da Silv','Taió')).confirmado,false);
  assert.equal((await identify('José da Silva','Cidade errada')).confirmado,false);
  assert.equal((await identify('José da Silva','Taió','11111111111')).confirmado,false);
  assert.equal((await identify('José da Silva','Taió')).confirmado,true);
  const context=(await db.query("select integracao_crm_contexto('chat.test',1,10) r")).rows[0].r;
  assert.equal(context.nucleo,'Núcleo exemplo');assert.equal(context.andamentos.length,1);
  assert.ok(!JSON.stringify(context).includes('SEGREDO'));assert.ok(!JSON.stringify(context).includes('OCULTO'));
  assert.deepEqual((await db.query('select to_jsonb(c) registro from fin_receb_clientes c')).rows,before);
  await db.query('select integracao_crm_receber($1)',[{...event,conversa_id:11,contato_id:21,mensagem_id:31,telefone:'+5547888880000'}]);
  assert.equal((await db.query("select integracao_crm_identificar('chat.test',1,11,'José da Silva','Taió','52998224725') r")).rows[0].r.confirmado,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','integracao_crm_identificar(text,bigint,bigint,text,text,text)','execute') p")).rows[0].p,false);
 }finally{await db.close();}
});
