// Vite deve estar em 127.0.0.1:5189. Rede externa é bloqueada; SQL roda em memória.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema erp_collab_private;create schema integracao_crm_privado;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,nome text,tipo text,ativo boolean);
 create function erp_collab_private.integracao_diretoria() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and tipo='Administrador' and ativo)$$;
 create function integracao_crm_privado.permite(text) returns boolean language sql as $$select true$$;
 create table fin_receb_municipios(id uuid primary key,nome text,uf text);
 create table fin_receb_clientes(id uuid primary key,nome text,municipio_id uuid);
 create table integracao_crm_cards(id uuid primary key,cliente_id uuid,responsavel_id uuid,comerciais_adicionais uuid[] default '{}',status text,lead_nome text,lead_cidade text,lead_municipio_id uuid,valor_total numeric,forma_negociacao text,parcelas int,desconto_percentual numeric,entrada_percentual numeric,entrada_valor numeric,updated_at timestamptz default now());
 create table integracao_crm_auditoria(id bigint,registro_id uuid,tabela text,anterior jsonb,atual jsonb,created_at timestamptz,acao text,autor_id uuid);
 insert into profiles values('${id(1)}','Diretor fictício','Administrador',true),('${id(2)}','Vendedor fictício','Comercial',true);
 select set_config('request.jwt.claim.sub','${id(1)}',false);`);
for(const f of ['20260924150000_crm_ativacoes.sql','20260926201425_crm_metas_estrategias.sql','20261026180103_crm_metas_ativacoes_comprovadas.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
await db.exec(`insert into integracao_crm_metas(id,titulo,escopo,setor,participantes,unidade,alvo,inicio,fim) values('${id(90)}','Meta fictícia','usuario','comercial',array['${id(2)}'::uuid],'quantidade',10,current_date-1,current_date+1);
 insert into fin_receb_clientes(id,nome) values('${id(20)}','Cliente fictício');
 insert into integracao_crm_cards(id,cliente_id,responsavel_id,status,valor_total,forma_negociacao,desconto_percentual) values('${id(80)}','${id(20)}','${id(2)}','Cliente novo',1200,'avista',0);
 select set_config('request.jwt.claim.sub','${id(2)}',false);`);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),erros=[];
 page.on('pageerror',e=>erros.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='127.0.0.1')return route.continue();
  const responder=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/rest/v1/rpc/integracao_crm_metas_painel')return responder((await db.query('select integracao_crm_metas_painel() metas')).rows[0].metas);
  if(url.pathname==='/rest/v1/integracao_crm_cards'){
   if(req.method()==='PATCH'){
    const dados=req.postDataJSON(),campos=Object.keys(dados);
    assert.ok(campos.every(k=>['status','valor_total','forma_negociacao','parcelas','desconto_percentual','entrada_percentual','entrada_valor'].includes(k)));
    await db.query(`update integracao_crm_cards set ${campos.map((k,i)=>`${k}=$${i+1}`).join(',')} where id=$${campos.length+1}`,[...Object.values(dados),id(80)]);
   }
   return responder((await db.query('select * from integracao_crm_cards')).rows);
  }
  throw new Error('Rede externa bloqueada: '+url.origin+url.pathname);
 });
 await page.goto('http://127.0.0.1:5189/tests/crm-metas-ativacao.browser.html');
 const progresso=page.getByRole('meter',{name:'Progresso de Meta fictícia'});
 await progresso.waitFor();assert.equal(await progresso.getAttribute('value'),'0');
 await page.getByLabel('Status',{exact:true}).selectOption('Cliente ativo');
 await page.getByRole('button',{name:'Salvar negociação e status'}).click();
 await page.waitForFunction(()=>document.querySelector('meter')?.value===1);
 const [evento]=(await db.query('select * from integracao_crm_ativacoes')).rows;
 assert.equal(evento.etapa_anterior,'Cliente novo');assert.equal(evento.responsavel_id,id(2));
 await page.reload();await page.waitForFunction(()=>document.querySelector('meter')?.value===1);
 assert.equal(await page.getByLabel('Status',{exact:true}).inputValue(),'Cliente ativo');
 // Repetição da gravação e atualização automática recebida pelo componente.
 await db.exec("update integracao_crm_cards set status='Cliente ativo'");
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:'crm'}})));
 await page.reload();await page.waitForFunction(()=>document.querySelector('meter')?.value===1);
 assert.equal((await db.query('select count(*) n from integracao_crm_ativacoes')).rows[0].n,1);
 await page.getByText('Como as vendas são contabilizadas').click();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/crm-metas-ativacao-mobile.png',fullPage:true});
 assert.deepEqual(erros,[]);
 console.log('PASS: UI → salvarNegociacaoCRM → triggers SQL → RPC → meta automática, repetição, reload e mobile; nenhum acesso externo.');
}finally{await browser.close();await db.close();}
