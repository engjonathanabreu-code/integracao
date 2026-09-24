import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {prepararBanco} from './crm-schema.test.js';
import {colunasRotina,TONS_ROTINA,tomPadrao,proximaSemana} from '../src/rotina-colunas.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const read=p=>readFileSync(new URL('../supabase/'+p,import.meta.url),'utf8');
async function como(db,n,sql,args=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
async function preparar(){const db=await prepararBanco();await db.exec(read('migrations/20260919184532_marketing_pos_protocolo.sql'));
 await db.exec(`alter table profiles add column setor text;insert into profiles(id,nome,tipo) values('${id(8)}','Fin','Financeiro');
  create schema integracao_financeiro_privado;create function integracao_financeiro_privado.operar() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and (tipo in ('Administrador','Diretor Técnico','Diretor de Projetos','Financeiro') or lower(trim(setor))='financeiro'))$$;
  grant usage on schema integracao_financeiro_privado to authenticated;grant execute on function integracao_financeiro_privado.operar() to authenticated;
  insert into integracao_marketing_rotina(ano,mes,semana,titulo,created_by) values(2026,9,1,'Antigo marketing','${id(5)}');`);
 await db.exec(read('migrations/20260924191000_rotina_colunas_financeiro.sql'));return db;}
test('colunas padrão, personalizadas e cards fora de coluna aparecem em ordem com tom da paleta',()=>{
 const c=colunasRotina([{semana:2,nome:'Conteúdo',tom:'rosa'},{semana:6,nome:'Campanhas',tom:'cinza'}],[{semana:9}]);
 assert.deepEqual(c.map(x=>[x.semana,x.nome,x.tom,x.personalizada]),[[1,'Semana 1','verde',false],[2,'Conteúdo','rosa',true],[3,'Semana 3','areia',false],[4,'Semana 4','lilas',false],[6,'Campanhas','cinza',true],[9,'Semana 9','verde',false]]);
 assert.equal(proximaSemana(c),10);assert.equal(proximaSemana(colunasRotina([],[])),5);assert.equal(tomPadrao(6),'azul');assert.deepEqual(TONS_ROTINA.map(t=>t.id),['verde','azul','areia','lilas','rosa','cinza']);
 assert.equal(colunasRotina([{semana:1,nome:'X',tom:'neon'}],[])[0].tom,'verde');
});
test('rotina separa Marketing e Financeiro e permite criar colunas extras com nome e tom',async()=>{const db=await preparar();try{
 assert.equal((await como(db,5,`select modulo from integracao_marketing_rotina`))[0].modulo,'marketing');
 await como(db,5,`insert into integracao_marketing_rotina(ano,mes,semana,titulo) values(2026,9,6,'Semana extra')`);
 await assert.rejects(()=>como(db,5,`insert into integracao_marketing_rotina(modulo,ano,mes,semana,titulo) values('financeiro',2026,9,1,'Invasão')`));
 await como(db,8,`insert into integracao_marketing_rotina(modulo,ano,mes,semana,titulo) values('financeiro',2026,9,1,'Conciliar boletos')`);
 await assert.rejects(()=>como(db,8,`insert into integracao_marketing_rotina(ano,mes,semana,titulo) values(2026,9,1,'Invasão')`));
 assert.deepEqual((await como(db,8,`select titulo from integracao_marketing_rotina`)).map(r=>r.titulo),['Conciliar boletos']);
 assert.equal((await como(db,5,`select * from integracao_marketing_rotina`)).length,2);assert.equal((await como(db,1,`select * from integracao_marketing_rotina`)).length,3);
 for(const n of [2,6])assert.equal((await como(db,n,`select * from integracao_marketing_rotina`)).length,0);
 await assert.rejects(()=>como(db,5,`update integracao_marketing_rotina set modulo='financeiro'`),/permission denied/);
 await assert.rejects(()=>como(db,5,`insert into integracao_marketing_rotina(ano,mes,semana,titulo) values(2026,9,21,'Fora')`));
 // Colunas
 await como(db,5,`insert into integracao_rotina_colunas(modulo,ano,mes,semana,nome,tom) values('marketing',2026,9,6,'Campanhas','rosa'),('marketing',2026,9,1,'Planejamento','azul')`);
 await assert.rejects(()=>como(db,5,`insert into integracao_rotina_colunas(modulo,ano,mes,semana,nome,tom) values('marketing',2026,9,7,'Neon','neon')`));
 await assert.rejects(()=>como(db,5,`insert into integracao_rotina_colunas(modulo,ano,mes,semana,nome,tom) values('marketing',2026,9,6,'Repetida','azul')`));
 await assert.rejects(()=>como(db,5,`insert into integracao_rotina_colunas(modulo,ano,mes,semana,nome,tom) values('financeiro',2026,9,5,'Invasão','azul')`));
 await como(db,8,`insert into integracao_rotina_colunas(modulo,ano,mes,semana,nome,tom) values('financeiro',2026,9,5,'Fechamento','areia')`);
 assert.deepEqual((await como(db,8,`select nome from integracao_rotina_colunas`)).map(r=>r.nome),['Fechamento']);
 await como(db,5,`update integracao_rotina_colunas set nome='Campanhas do mês',tom='lilas' where semana=6`);
 await assert.rejects(()=>como(db,5,`update integracao_rotina_colunas set semana=8 where semana=6`),/permission denied/);
 await assert.rejects(()=>como(db,5,`delete from integracao_rotina_colunas where semana=6`),/Mova ou remova/);
 await como(db,5,`delete from integracao_rotina_colunas where semana=1`); // padrão volta ao nome original, cards ficam
 await como(db,5,`update integracao_marketing_rotina set ativo=false where semana=6`);await como(db,5,`delete from integracao_rotina_colunas where semana=6`);
 assert.equal((await como(db,5,`select * from integracao_rotina_colunas`)).length,0);assert.equal((await como(db,5,`select * from integracao_marketing_rotina`)).length,2);
 }finally{await db.close();}});
