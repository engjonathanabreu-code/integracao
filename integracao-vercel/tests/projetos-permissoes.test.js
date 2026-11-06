import test from 'node:test';
import assert from 'node:assert/strict';
import {permissoes} from '../src/permissoes.js';
import {registrarContrato,limparContratos} from '../src/permissoes-contrato.js';
import {podeGerarOficios,podeEditarOficios} from '../src/oficios-permissoes.js';
import gerar from '../api/oficios-gerar.js';

test('Projetos recebe apenas capacidades geográficas, memorial do núcleo e área',()=>{
 const p=permissoes({id:'projeto',setor:'projeto',ativo:true});
 for(const campo of ['mapaNucleo','importacaoGeografica','memorialNucleo','areaUnidade'])assert.equal(p[campo],true,campo);
 assert.equal(p.etapa('topografia'),false);assert.equal(p.campo,false);assert.equal(p.imovel,false);assert.equal(p.validarDocs,false);
 const t=permissoes({setor:'topografia',ativo:true});
 for(const campo of ['mapaNucleo','importacaoGeografica','memorialNucleo','areaUnidade'])assert.equal(t[campo],true,campo);
 assert.equal(permissoes({setor:'comercial',ativo:true}).mapaNucleo,true);
 assert.equal(permissoes({setor:'comercial',ativo:true}).importacaoGeografica,false);
 const misto=permissoes({setor:'consulta',tipoERP:'Marketing',setorERP:'Projetos',ativo:true});
 for(const campo of ['mapaNucleo','importacaoGeografica','memorialNucleo','areaUnidade'])assert.equal(misto[campo],true,campo);
 assert.equal(misto.campo,false);assert.equal(misto.etapa('topografia'),false);assert.equal(misto.imovel,false);
});
test('novas capacidades respeitam contratos e bloqueiam contas inativas',()=>{
 try{registrarContrato('p',{regras:{nucleos:{editar:false},clientes:{editar:false}}});
 for(const u of [{id:'p',setor:'projeto',ativo:true},{setor:'diretoria',ativo:false},null])
  for(const campo of ['mapaNucleo','importacaoGeografica','memorialNucleo','areaUnidade'])assert.equal(permissoes(u)[campo],false,campo);
 }finally{limparContratos();}
});
test('todos os perfis ativos geram ofício sem receber edição ou envio',()=>{
 for(const tipo of ['Administrador','Diretor de Projetos','Comercial','Financeiro','Jurídico','Marketing','Pós-protocolo','Projetos','Topografia']){
  assert.equal(podeGerarOficios({tipo,ativo:true}),true,tipo);
  assert.equal(podeGerarOficios({tipo,ativo:false}),false,tipo);
 }
 for(const tipo of ['Comercial','Financeiro','Marketing','Pós-protocolo','Topografia'])assert.equal(podeEditarOficios({tipo,ativo:true}),false,tipo);
 assert.equal(podeGerarOficios(null),false);assert.equal(podeGerarOficios({}),false);
});
function res(){return{statusCode:200,setHeader(){},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};}
test('API de geração confirma sessão e perfil ativo, permitindo qualquer setor',async()=>{
 const original=globalThis.fetch,chave=process.env.OPENAI_API_KEY;
 try{
 delete process.env.OPENAI_API_KEY;
 const body={assunto:'Teste',orientacao:'Solicitar documentos'};
 let r=res();await gerar({method:'POST',headers:{},body},r);assert.equal(r.statusCode,401);
 for(const tipo of ['Comercial','Financeiro','Marketing','Pós-protocolo','Topografia','Projetos','Jurídico','Administrador']){
  globalThis.fetch=async url=>Response.json(url.includes('/auth/')?{id:'00000000-0000-4000-8000-000000000001'}:[{tipo,ativo:true}]);
  r=res();await gerar({method:'POST',headers:{authorization:'Bearer ficticio'},body},r);assert.equal(r.statusCode,503,tipo);assert.match(r.body.message,/IA está indisponível/);
 }
 globalThis.fetch=async url=>Response.json(url.includes('/auth/')?{id:'00000000-0000-4000-8000-000000000001'}:[{tipo:'Projetos',ativo:false}]);
 r=res();await gerar({method:'POST',headers:{authorization:'Bearer ficticio'},body},r);assert.equal(r.statusCode,403);
 }finally{globalThis.fetch=original;if(chave===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=chave;}
});
