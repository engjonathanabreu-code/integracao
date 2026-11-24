import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {criarConfirmacaoMeta,emSegundoPlano,MENSAGEM_SEGUNDO_PLANO} from '../src/confirmacao-criacao-meta.js';
import {conciliarEdicoes} from '../src/concorrencia.js';
import { erroCodigoMorador, resolverCodigoMorador } from '../src/codigo-morador.js';
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const start=source.indexOf('  const confirmarCadastro = async () => {',source.indexOf('function PaginaProcesso('));
const salvar=source.slice(start,source.indexOf('  const aplicarIA =',start));
function fixture(codigo,permissao=true) {
 const p={id:'a',codigo:'ITA01_212',numeroCliente:212,municipioId:'m',remessaId:'r',nucleoId:'n',requerente:{nome:'Pessoa',cpf:''},conjuge:{},corequerentes:[],ocupantes:[],endereco:{},enderecoImovel:{},docs:[{id:'doc'}],unidades:[{id:'un'}],extras:{}};
 const rascunho={...structuredClone(p),codigo};
 const db={processos:[p,{id:'b',codigo:'ITA01_213'}]};
 let grava=0;const mensagens=[];
 const extrair=p=>Object.fromEntries(['requerente','conjuge','corequerentes','ocupantes','endereco','enderecoImovel','remessaId','nucleoId','extras'].map(k=>[k,structuredClone(p[k])]));
 const mutar=()=>{throw Error('gravação sem confirmação');};
 let resolver, rejeitar, retomar=0;
 const pendente=()=>new Promise((resolve,reject)=>{resolver=resolve;rejeitar=reject;});
 mutar.confirmado=fn=>{grava++;fn(db);return pendente();};
 const context=vm.createContext({
  fichaAtual:{current:p},baseFormulario:{current:{...extrair(p),codigo:p.codigo}},extrair,conciliarEdicoes,
  tentativaCadastro:{current:null},enviandoCadastro:{current:false},setConfirmandoCadastro:()=>{},setErroCadastro:()=>{},
  setRascunho:()=>{},criarConfirmacaoMeta,emSegundoPlano,MENSAGEM_SEGUNDO_PLANO,AMBIENTE:{DEMO:false},mutar,
  p,rascunho,db,perm:{cadastro:permissao},cancelado:false,erroCodigoMorador,resolverCodigoMorador,
 exigeDocumentoCRM:()=>false,ehPJ:()=>false,cpfValido:()=>true,cnpjValido:()=>true,so:s=>String(s||'').replace(/\D/g,''),
 remessaDe:()=>({id:'r',municipioId:'m'}),nucleoDe:()=>({id:'n',remessaId:'r'}),nomeRemessa:()=>'',proximoNumeroCliente:()=>214,codigoCliente:()=>'',
 alterados:['codigo'],defs:[],CONFRONTANTES:[],iaPaths:[],rotuloCaminho:k=>k,
 SECOES:['requerente','conjuge','corequerentes','ocupantes','endereco','enderecoImovel','remessaId','nucleoId','extras'],clone:structuredClone,
 atualizarQualificacao:q=>q.qualificacao,usuario:{nome:'Teste'},setIaPaths:()=>{},setToast:t=>mensagens.push(t),
 });
 return {p,rodar:()=>vm.runInContext('(()=>{'+salvar+'return salvar();})()',context),gravacoes:()=>grava,mensagens,confirmar:()=>resolver(),retomadas:()=>retomar,
  falhar:()=>rejeitar(Object.assign(Error('Tempo esgotado'),{retentarConfirmacao:()=>{retomar++;return pendente();}}))};
}
test('Salvar cadastro persiste o código e sequência preservando identidade, vínculos, unidade e documento',async()=>{
 const f=fixture('ITA01_215');const antes=structuredClone(f.p);const gravacao=f.rodar();await Promise.resolve();f.confirmar();await gravacao;
 assert.equal(f.gravacoes(),1);assert.equal(f.p.codigo,'ITA01_215');assert.equal(f.p.numeroCliente,215);
 for(const k of ['id','municipioId','remessaId','nucleoId','docs','unidades','requerente'])assert.deepEqual(f.p[k],antes[k]);
});
test('Salvar cadastro bloqueia duplicado e usuário sem permissão antes de qualquer gravação',async()=>{
 for(const [codigo,pode] of [['ITA01_213',true],['ITA01_215',false]]){
  const f=fixture(codigo,pode);await f.rodar();assert.equal(f.gravacoes(),0);assert.equal(f.p.codigo,'ITA01_212');
 }
});

test('cadastro não anuncia sucesso no atraso ou timeout e retoma a mesma intenção',async()=>{
 const f=fixture('ITA01_215');
 const primeira=f.rodar();
 await f.rodar();
 assert.equal(f.gravacoes(),1);
 assert.deepEqual(f.mensagens,[]);
 f.falhar();
 await primeira;
 const retry=f.rodar();
 await Promise.resolve();
 assert.equal(f.retomadas(),1);
 assert.equal(f.gravacoes(),1);
 assert.deepEqual(f.mensagens,[]);
 f.confirmar();
 await retry;
 assert.match(f.mensagens[0],/Gravação confirmada/);
});
