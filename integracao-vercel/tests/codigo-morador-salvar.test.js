import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { erroCodigoMorador, resolverCodigoMorador } from '../src/codigo-morador.js';
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const start=source.indexOf('  const salvar = () => {',source.indexOf('function PaginaProcesso('));
const salvar=source.slice(start,source.indexOf('  const aplicarIA =',start));
function fixture(codigo,permissao=true) {
 const p={id:'a',codigo:'ITA01_212',numeroCliente:212,municipioId:'m',remessaId:'r',nucleoId:'n',requerente:{nome:'Pessoa',cpf:''},conjuge:{},corequerentes:[],ocupantes:[],endereco:{},enderecoImovel:{},docs:[{id:'doc'}],unidades:[{id:'un'}],extras:{}};
 const rascunho={...structuredClone(p),codigo};
 const db={processos:[p,{id:'b',codigo:'ITA01_213'}]};
 let grava=0;const mensagens=[];
 const context=vm.createContext({p,rascunho,db,perm:{cadastro:permissao},cancelado:false,erroCodigoMorador,resolverCodigoMorador,
 exigeDocumentoCRM:()=>false,ehPJ:()=>false,cpfValido:()=>true,cnpjValido:()=>true,so:s=>String(s||'').replace(/\D/g,''),
 remessaDe:()=>({id:'r',municipioId:'m'}),nucleoDe:()=>({id:'n',remessaId:'r'}),nomeRemessa:()=>'',proximoNumeroCliente:()=>214,codigoCliente:()=>'',
 alterados:['codigo'],defs:[],CONFRONTANTES:[],iaPaths:[],rotuloCaminho:k=>k,
 SECOES:['requerente','conjuge','corequerentes','ocupantes','endereco','enderecoImovel','remessaId','nucleoId','extras'],clone:structuredClone,
 atualizarQualificacao:q=>q.qualificacao,usuario:{nome:'Teste'},setIaPaths:()=>{},setToast:t=>mensagens.push(t),mutar:fn=>{grava++;fn(db);},
 });
 return {p,rodar:()=>vm.runInContext(salvar+'salvar();',context),gravacoes:()=>grava,mensagens};
}
test('Salvar cadastro persiste o código e sequência preservando identidade, vínculos, unidade e documento',()=>{
 const f=fixture('ITA01_215');const antes=structuredClone(f.p);f.rodar();
 assert.equal(f.gravacoes(),1);assert.equal(f.p.codigo,'ITA01_215');assert.equal(f.p.numeroCliente,215);
 for(const k of ['id','municipioId','remessaId','nucleoId','docs','unidades','requerente'])assert.deepEqual(f.p[k],antes[k]);
});
test('Salvar cadastro bloqueia duplicado e usuário sem permissão antes de qualquer gravação',()=>{
 for(const [codigo,pode] of [['ITA01_213',true],['ITA01_215',false]]){
  const f=fixture(codigo,pode);f.rodar();assert.equal(f.gravacoes(),0);assert.equal(f.p.codigo,'ITA01_212');
 }
});
