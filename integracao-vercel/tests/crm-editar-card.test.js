import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepararBanco} from './crm-schema.test.js';
import {formatarDocumento,prepararEdicaoCard,exigeDocumentoCRM,valoresCard} from '../src/crm-edicao.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const read=p=>readFileSync(new URL('../supabase/'+p,import.meta.url),'utf8');
async function como(db,n,sql,args=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
async function preparar(){const db=await prepararBanco();await db.exec(`alter table fin_receb_remessas add column codigo text,add column ativo boolean default true,add column created_at timestamptz default now();alter table integracao_moradores add column referencia_tabela text,add column criado_por uuid;alter table integracao_moradores add primary key(colecao,registro_id);
 insert into fin_receb_municipios(id,nome,uf) values('${id(33)}','Rio do Sul','SC');insert into processos_kanban(id,nucleo) values('${id(41)}','Núcleo dois');insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(31)}','Primeira','${id(30)}','TAI01');`);
 for(const f of ['crm-leads.sql','crm-lead-responsavel.sql','crm-carregamento.sql'])await db.exec(read('operacoes/'+f));
 for(const f of ['20260922162925_crm_multiplos_comerciais.sql','20260919182005_chatwoot_ia_conexao.sql','20260923122108_crm_followup_dashboard.sql','20260923160000_crm_arquivo_leads.sql','20260924120000_crm_editar_card.sql'])await db.exec(read('migrations/'+f));
 await db.exec(`insert into integracao_crm_cards(id,lead_nome,lead_telefone,lead_municipio_id,responsavel_id,comerciais_adicionais) values('${id(80)}','Lead Ana','48999990000','${id(30)}','${id(2)}',array['${id(3)}']::uuid[]),('${id(81)}','Lead Bia','47988887777','${id(33)}','${id(3)}','{}');
  insert into integracao_crm_cards(id,cliente_id,responsavel_id,status) values('${id(82)}','${id(20)}','${id(2)}','Negociação');
  update fin_receb_clientes set municipio_id='${id(30)}',remessa_id='${id(31)}' where id='${id(20)}';
  insert into integracao_moradores(colecao,registro_id,referencia_id,dados) values('processos','${id(20)}','${id(20)}','{"nucleoId":"n1","docs":[1],"requerente":{"telefone":"4833330000","rg":"123"}}');`);
 return db;}
const funil=async(db,n,card)=>(await como(db,n,`select * from integracao_crm_funil where id='${id(card)}'`))[0];
const editar=async(db,n,card,form)=>{const atual=await funil(db,1,card);const dados=prepararEdicaoCard({...valoresCard(atual),...form},atual);return como(db,n,'select integracao_crm_editar_card($1,$2,$3,$4,$5,$6,$7)',[dados.p_card,dados.p_nome,dados.p_telefone,dados.p_cpf,dados.p_municipio,dados.p_nucleo,JSON.stringify(dados.p_anterior)]);};
const direto=(db,n,card,{nome='Lead Ana',telefone='',cpf='',municipio=id(30),nucleo=null,anterior})=>como(db,n,'select integracao_crm_editar_card($1,$2,$3,$4,$5,$6,$7)',[id(card),nome,telefone,cpf,municipio,nucleo,JSON.stringify(anterior)]);

test('documento: CPF e CNPJ formatados, vazio permitido antes do contrato',()=>{
 assert.equal(formatarDocumento('52998224725'),'529.982.247-25');assert.equal(formatarDocumento('11.222.333/0001-81'),'11.222.333/0001-81');assert.equal(formatarDocumento(''),'');
 for(const v of ['52998224724','11111111111','123','11222333000180'])assert.throws(()=>formatarDocumento(v));
 for(const s of ['Cliente novo','Negociação','Perdido'])assert.equal(exigeDocumentoCRM(s),false);for(const s of ['Contrato','Cliente ativo','Cliente Ativo',''])assert.equal(exigeDocumentoCRM(s),true);
 const card={id:'x',status:'Cliente novo',lead_nome:'Ana',lead_municipio_id:'m'};assert.equal(prepararEdicaoCard({nome:'Ana Maria',municipio_id:'m'},card).p_cpf,'');
 assert.throws(()=>prepararEdicaoCard({nome:'Ana',municipio_id:'m'},{...card,status:'Contrato'}),/obrigatório/);assert.throws(()=>prepararEdicaoCard({nome:'A',municipio_id:'m'},card),/nome/);assert.throws(()=>prepararEdicaoCard({nome:'Ana',telefone:'123',municipio_id:'m'},card),/Telefone/);assert.throws(()=>prepararEdicaoCard({nome:'Ana'},card),/município/);
});

test('lead: edita nome, telefone, CPF, município e núcleo sem exigir os demais dados; conversão leva CPF e núcleo',async()=>{const db=await preparar();try{
 await editar(db,3,80,{nome:'Ana Souza',telefone:'',cpf:'',municipio_id:id(30)}); // Comercial adicional pode editar; campos vazios são aceitos.
 let c=await funil(db,2,80);assert.equal(c.lead_nome,'Ana Souza');assert.equal(c.lead_telefone,null);assert.equal(c.cpf_cnpj,null);
 await editar(db,2,80,{telefone:'(48) 99999-1111',cpf:'52998224725',municipio_id:id(33),nucleo_id:id(40)});
 c=await funil(db,2,80);assert.equal(c.cpf_cnpj,'529.982.247-25');assert.equal(c.municipio,'Rio do Sul');assert.equal(c.nucleo_id,id(40));assert.equal(c.lead_telefone,'(48) 99999-1111');
 await assert.rejects(()=>editar(db,3,81,{telefone:'48999991111'}),/Já existe um lead/); // Bia também responde pelo lead 80, no mesmo município.
 await editar(db,3,81,{telefone:'48999992222'});
 await assert.rejects(()=>editar(db,2,81,{nome:'Invasão'}),/Sem permissão/);await assert.rejects(()=>editar(db,6,80,{nome:'Topografia'}),/Sem permissão/);
 await assert.rejects(()=>editar(db,2,80,{cpf:'52998224724'}),/CPF inválido/);
 await assert.rejects(()=>direto(db,2,80,{nome:'Ana',anterior:{nome:'Outro nome'}}),/alterado por outra pessoa/);
 const atual=valoresCard(await funil(db,2,80));await assert.rejects(()=>direto(db,2,80,{...atual,nome:'Ana',municipio:id(33),nucleo:id(99),anterior:atual}),/Núcleo não encontrado/);
 await assert.rejects(()=>direto(db,2,80,{nome:'Ana',municipio:null,anterior:atual}),/município/);
 await assert.rejects(()=>como(db,2,`update integracao_crm_cards set lead_cpf='529.982.247-25' where id='${id(80)}'`),/permission denied/);
 // Conversão em cliente a partir do lead editado.
 await db.exec(`insert into fin_receb_remessas(id,nome,municipio_id,codigo) values('${id(34)}','Rio','${id(33)}','RIO01')`);
 const prev={status:'Cliente novo',valor_total:null,forma_negociacao:null,parcelas:null,desconto_percentual:null,entrada_percentual:null};
 const cliente=(await como(db,2,'select integracao_crm_converter_lead($1,$2,$3,$4,$5) id',[id(80),id(33),id(34),JSON.stringify({...prev,status:'Contrato'}),JSON.stringify(prev)]))[0].id;
 assert.equal((await db.query(`select cpf_cnpj from fin_receb_clientes where id='${cliente}'`)).rows[0].cpf_cnpj,'529.982.247-25');
 assert.equal((await db.query(`select dados->>'nucleoId' n from integracao_moradores where referencia_id='${cliente}'`)).rows[0].n,id(40));
 c=await funil(db,2,80);assert.equal(c.cpf_cnpj,'529.982.247-25');assert.equal(c.nucleo_id,id(40));assert.equal(c.status,'Contrato');
 // Após o contrato o CPF passa a ser exigido.
 await assert.rejects(()=>direto(db,2,80,{...valoresCard(c),cpf:'',municipio:id(33),nucleo:id(40),anterior:valoresCard(c)}),/obrigatório a partir da etapa Contrato/);
 await editar(db,2,80,{nome:'Ana Souza Lima'});assert.equal((await db.query(`select nome from fin_receb_clientes where id='${cliente}'`)).rows[0].nome,'Ana Souza Lima');
 }finally{await db.close();}});

test('cliente vinculado antes do contrato: edita cadastro sem CPF, preserva dados do morador e não troca município',async()=>{const db=await preparar();try{
 await editar(db,2,82,{nome:'Cliente Editado',telefone:'48 3333-1111',cpf:'',nucleo_id:'n1'}); // núcleo legado preservado
 let c=await funil(db,2,82);assert.equal(c.nome,'Cliente Editado');assert.equal(c.telefone,'48 3333-1111');assert.equal(c.cpf_cnpj,null);assert.equal(c.nucleo_id,'n1');
 let d=(await db.query(`select dados from integracao_moradores where referencia_id='${id(20)}'`)).rows[0].dados;assert.equal(d.requerente.rg,'123');assert.deepEqual(d.docs,[1]);
 await editar(db,2,82,{cpf:'529.982.247-25',nucleo_id:id(41)});c=await funil(db,2,82);assert.equal(c.cpf_cnpj,'529.982.247-25');assert.equal(c.nucleo_id,id(41));
 await editar(db,2,82,{nucleo_id:''});d=(await db.query(`select dados from integracao_moradores where referencia_id='${id(20)}'`)).rows[0].dados;assert.equal('nucleoId' in d,false);
 const atual=valoresCard(await funil(db,2,82));await assert.rejects(()=>direto(db,2,82,{...atual,municipio:id(33),anterior:atual}),/Abrir cadastro/);
 await assert.rejects(()=>editar(db,3,82,{nome:'Sem acesso'}),/Sem permissão/);
 await editar(db,1,82,{nome:'Editado pela diretoria'});assert.equal((await funil(db,2,82)).nome,'Editado pela diretoria');
 }finally{await db.close();}});
