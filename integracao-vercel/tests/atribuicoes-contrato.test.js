import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararContrato,como,id} from './atribuicoes-contrato.fixture.js';
import {acaoPermitida,registrarContrato,limparContratos} from '../src/permissoes-contrato.js';
import {permissoes,podeUsarAgentes} from '../src/permissoes.js';

test('rascunho de fluxo salva com CAS e auditoria sem conceder acesso; rejeita autoedicao e chaves desconhecidas',async()=>{
 const {db}=await prepararContrato();try{
  const matriz={schema_version:1,atribuicoes:[],fluxo_moradores:{'topografia.avancar':'permitir',validar_documentos:'negar'}};
  const salvar=(ator,alvo,revisao,m,req)=>como(db,ator,'select public.integracao_atribuicoes_salvar($1,$2,$3,$4,$5) resultado',[id(alvo),revisao,JSON.stringify(m),'Revisão sintética',id(req)]);
  const resultado=(await salvar(4,2,0,matriz,901))[0].resultado;
  assert.equal(resultado.revisao,1);assert.equal(resultado.acesso_efetivo_alterado,false);
  assert.deepEqual((await salvar(4,2,0,matriz,901))[0].resultado,resultado);
  await assert.rejects(salvar(4,2,0,matriz,902),/Conflito de revisao/);
  await assert.rejects(salvar(4,4,0,matriz,903),/proprias|proprio|mesmo/i);
  await assert.rejects(salvar(2,1,0,matriz,904),/Administrador/);
  await assert.rejects(salvar(4,2,1,{...matriz,fluxo_moradores:{administrador:'permitir'}},905),/fluxo invalida/);
  assert.equal((await db.query('select count(*)::int n from integracao_atribuicoes_auditoria')).rows[0].n,1);
  assert.equal((await como(db,2,"select integracao_atribuicoes_privado.escolha('clientes','excluir') escolha"))[0].escolha,false);
 }finally{await db.close();}
});
test('contrato não usa nome/setor local como concessão e não transforma perfil em administrador',()=>{
 limparContratos();const u={id:id(1),erpRef:id(1),nome:'Nome fictício',tipoERP:'Projetos',setor:'projeto',ativo:true};
 registrarContrato(u.id,{regras:{planos:{editar:true,criar:true},metas:{aprovar:false}}});
 assert.equal(permissoes(u).planos,true);assert.equal(permissoes(u).criarPlanos,true);assert.equal(permissoes(u).usuarios,false);assert.equal(podeUsarAgentes(u),false);
 assert.equal(acaoPermitida(u,'metas','aprovar',true),false);assert.equal(acaoPermitida({...u,ativo:false},'planos','editar'),false);
 assert.equal(permissoes({...u,erpRef:id(10)}).planos,false);limparContratos();
});
test('RLS e gates: negativos prevalecem, planos respeitam escopo e outros 14 perfis não são alterados',async()=>{
 const {db,antes}=await prepararContrato();try{
  assert.equal((await db.query(`select md5(string_agg(row(id,tipo,setor,ativo)::text,',' order by id)) hash from profiles`)).rows[0].hash,antes);
  assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n,17);
  for(const [n,r,a,permitido] of [[1,'planos','criar',true],[1,'metas','aprovar',false],[1,'metas','exportar',false],[1,'ordens_servico','excluir',false],[2,'clientes','exportar',false],[2,'nucleos','excluir',false],[3,'documentos','exportar',false],[3,'chat','excluir',false]]){
   const result=await como(db,n,'select public.integracao_atribuicoes_autorizar($1,$2) ok',[r,a]);assert.equal(result[0].ok,permitido,`${n}/${r}/${a}`);
  }
  await assert.rejects(como(db,0,'select public.integracao_atribuicoes_contrato_ler()'),/permission denied/);
  await assert.rejects(como(db,2,'select public.integracao_atribuicoes_contrato_ler($1)',[id(1)]),/administração/);
  for(let n=4;n<=17;n++)assert.equal((await como(db,n,"select integracao_atribuicoes_privado.escolha('clientes','editar') regra"))[0].regra,null);
  await db.exec(`update profiles set ativo=false where id='${id(17)}'`);
  assert.equal((await como(db,17,"select integracao_atribuicoes_privado.escolha('clientes','excluir') regra"))[0].regra,null);
  assert.equal((await como(db,17,"select public.integracao_atribuicoes_autorizar('clientes','exportar') ok"))[0].ok,false);
  await db.exec(`update profiles set ativo=true where id='${id(17)}'`);
  await assert.rejects(como(db,1,`update metas set status='Concluído' where id='${id(202)}'`),/Aprovação/);
  await db.exec(`insert into integracao_metas values('metas','fixture-meta','{"status":"Em andamento"}',null,null,'${id(4)}');insert into integracao_complementos values('metas','fixture-meta','{"status":"Em andamento"}',null)`);
  for(const t of ['integracao_metas','integracao_complementos'])await assert.rejects(como(db,1,`update ${t} set dados=jsonb_set(dados,'{status}','"Concluído"') where registro_id='fixture-meta'`),/Aprovacao/);
  assert.equal((await como(db,1,`delete from metas where id='${id(202)}' returning id`)).length,0);
  assert.equal((await como(db,1,`delete from ordens_servico where id='${id(203)}' returning id`)).length,0);
  await assert.rejects(como(db,2,`update processos_kanban set excluido_erp=true where id='${id(201)}'`),/Exclusão/);
  await como(db,2,`update fin_receb_clientes set nome='Cadastro fictício atualizado' where id='${id(200)}'`);
  await assert.rejects(como(db,2,`update fin_receb_clientes set ativo=false where id='${id(200)}'`),/Situação/);
  assert.equal((await como(db,1,'select id from planos_trabalho')).length,1);
  await como(db,1,`insert into planos_trabalho values('${id(120)}','${id(1)}','Plano criado no teste',null,'Em andamento')`);
  await como(db,1,`insert into etapas_plano values('${id(121)}','${id(120)}','Nova etapa','Pendente')`);
  await como(db,1,`update planos_trabalho set titulo='Plano de teste editado' where id='${id(120)}'`);
  await como(db,1,`update planos_trabalho set projeto_id='${id(400)}' where id='${id(120)}'`);
  await assert.rejects(como(db,1,`update planos_trabalho set projeto_id='${id(401)}' where id='${id(120)}'`),/row-level security/);
  await assert.rejects(como(db,1,`insert into planos_trabalho values('${id(123)}','${id(1)}','Vinculo proibido','${id(401)}','Em andamento')`),/row-level security/);
  await assert.rejects(como(db,1,`update planos_trabalho set created_by='${id(4)}' where id='${id(120)}'`),/Autoria/);
  assert.equal((await como(db,1,`update planos_trabalho set titulo='Proibido' where id='${id(101)}' returning id`)).length,0);
  await assert.rejects(como(db,1,`insert into etapas_plano values('${id(122)}','${id(101)}','Etapa alheia','Pendente')`),/row-level security/);
  await como(db,1,`insert into etapa_responsaveis values('${id(121)}','${id(2)}')`);
  assert.equal((await como(db,2,`select id from planos_trabalho where id='${id(120)}'`)).length,1);
  assert.equal((await como(db,2,`select id from planos_trabalho where id='${id(101)}'`)).length,0);
  await assert.rejects(como(db,1,`insert into etapa_responsaveis values('${id(111)}','${id(2)}')`),/row-level security/);
  await assert.rejects(como(db,1,`update etapa_responsaveis set etapa_id='${id(111)}' where etapa_id='${id(121)}'`),/row-level security/);
  await db.exec(`update profiles set ativo=false where id='${id(17)}'`);
  await assert.rejects(como(db,1,`insert into etapa_responsaveis values('${id(121)}','${id(17)}')`),/row-level security/);
  await assert.rejects(como(db,1,`update etapa_responsaveis set usuario_id='${id(17)}' where etapa_id='${id(121)}'`),/row-level security/);
  await como(db,1,`delete from etapa_responsaveis where etapa_id='${id(121)}'`);
  assert.equal((await como(db,2,`select id from planos_trabalho where id='${id(120)}'`)).length,0);
  await db.exec(`update profiles set ativo=true where id='${id(17)}'`);
  assert.equal((await como(db,3,`select id from erp_conversas`)).length,1);
  assert.equal((await como(db,3,`select id from erp_conversas where id='${id(301)}'`)).length,0);
  await db.exec(`insert into integracao_complementos values('conversas','fixture-chat','{"titulo":"Conversa ficticia"}',null)`);
  await assert.rejects(como(db,3,`delete from integracao_complementos where registro_id='fixture-chat'`),/autorizada/);
  await assert.rejects(como(db,3,`update integracao_complementos set dados='{"excluida":true}' where registro_id='fixture-chat'`),/autorizada/);
  await assert.rejects(como(db,1,'select * from integracao_atribuicoes_privado.contratos'),/permission denied/);
  await assert.rejects(db.exec('delete from integracao_atribuicoes_privado.auditoria'),/imutável/);
 }finally{await db.close();}
});
test('editar cadastro não avança etapas alheias, valida documento nem altera situação',async()=>{
 const {db}=await prepararContrato();try{
  const atualizar=(n,dados)=>como(db,n,`update integracao_moradores set dados=dados||$1::jsonb where registro_id='${id(200)}'`,[JSON.stringify(dados)]);
  await atualizar(1,{requerente:{nome:'Cadastro fictício alterado'}});
  for(const n of [1,2,3]){
   await assert.rejects(atualizar(n,{etapa:1}),/Fluxo setorial/);
   await assert.rejects(atualizar(n,{checks:{contrato:true}}),/Fluxo setorial/);
   await assert.rejects(atualizar(n,{situacao:'Inativo'}),/Situação/);
   await assert.rejects(atualizar(n,{docs:[{id:'doc-ficticio',tipo:'identidade',status:'validado'}]}),/Validação documental/);
  }
  await atualizar(3,{docs:[{id:'doc-ficticio',tipo:'identidade',status:'recebido'}]});
  await assert.rejects(atualizar(3,{docs:[]}),/Remoção/);
  await db.exec(`update integracao_moradores set dados=jsonb_set(dados,'{etapa}','3') where registro_id='${id(200)}'`);
  await atualizar(2,{checks:{medicao:true}});
  await assert.rejects(atualizar(2,{etapa:2}),/Retrocesso exige motivo/);
  await atualizar(2,{etapa:2,reaberturaFluxo:{de:3,para:2,motivo:'Conferir documento sintético'}});
  await db.exec(`update integracao_moradores set dados=jsonb_set(dados,'{etapa}','3') where registro_id='${id(200)}'`);
  await assert.rejects(atualizar(2,{checks:{medicao:true,contrato:true}}),/outra etapa/);
  await assert.rejects(atualizar(2,{checks:{medicao:true,area:true}}),/automatico/);
  await assert.rejects(atualizar(2,{campos:{protocolo:'fictício'}}),/outra etapa/);
  await db.query(`insert into integracao_configuracoes values('config','ajustesMunicipio',$1)`,[JSON.stringify({valor:{'municipio-ficticio':{ajustesRequisitos:{topografia:{extras:[{id:'campo-local',tipo:'campo'}]}}}}})]);
  await db.exec(`update integracao_moradores set dados=dados||'{"municipioId":"municipio-ficticio"}'::jsonb where registro_id='${id(200)}'`);
  await atualizar(2,{campos:{'campo-local':'Preenchimento sintético'}});
  await assert.rejects(atualizar(1,{checks:{medicao:true,lepac:true}}),/Fluxo setorial/);
  await assert.rejects(atualizar(2,{etapa:5}),/pular etapas/);
  await db.exec(`update integracao_moradores set dados=jsonb_set(dados,'{etapa}','4') where registro_id='${id(200)}'`);
  await atualizar(1,{checks:{medicao:true,termoAssinado:true}});
  await assert.rejects(atualizar(3,{checks:{termoAssinado:false}}),/Fluxo setorial/);
 }finally{await db.close();}
});
