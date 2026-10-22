import {beneficiarioConjuge} from '../src/beneficiario-conjuge.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {transformSync} from 'esbuild';
import {selecionarDocumentos, MAX_TAMANHO_DOCUMENTO} from '../src/documentos-upload.js';
import {projetar, prepararEdicao, copy} from '../src/dados-compartilhados.js';
import {fixture, blank, id} from './fixture.js';

test('upload compartilhado valida formato, tamanho e vagas com arquivos sintéticos', () => {
  const file=(name,type='application/pdf',size=1)=>({name,type,size});
  const valido=file('sintetico.pdf','',MAX_TAMANHO_DOCUMENTO);
  const r=selecionarDocumentos([valido,file('grande.pdf','application/pdf',MAX_TAMANHO_DOCUMENTO+1),file('arquivo.exe','application/octet-stream')]);
  assert.deepEqual(r.aceitos,[valido]);assert.match(r.erro,/20 MB/);assert.match(r.erro,/formato/);
  assert.equal(selecionarDocumentos(Array.from({length:13},()=>valido)).aceitos.length,12);
  assert.equal(selecionarDocumentos([valido],0).aceitos.length,0);
});

test('beneficiário e observações persistem no complemento e reabrem sem modificar financeiro', () => {
  const base=fixture();base.integracao_moradores=[{colecao:'processos',registro_id:id(4),referencia_tabela:'fin_receb_clientes',referencia_id:id(4),dados:{conjuge:{nome:'Cônjuge legado',beneficiario:'sim'}}}];
  const s=projetar(base,blank()), n=copy(s.db);
  assert.notEqual(n.processos[0].conjuge?.beneficiarioTitulo,'sim');
  n.processos[0].conjuge={...n.processos[0].conjuge,nome:'Cônjuge Sintético',beneficiarioTitulo:'nao'};
  n.processos[0].extras.observacoesDocumental='Observação sintética\nSegunda linha';
  const ops=prepararEdicao(s.db,n,s,s.db.usuarios[0]);
  assert.equal(ops.some(o=>o.table==='fin_receb_clientes'),false);
  const op=ops.find(o=>o.table==='integracao_moradores');assert.ok(op);
  base.integracao_moradores=[{...op.key,...op.changes}];
  const reaberto=projetar(base,blank());
  assert.equal(reaberto.db.processos[0].conjuge.beneficiarioTitulo,'nao');
  assert.equal(reaberto.db.processos[0].extras.observacoesDocumental,'Observação sintética\nSegunda linha');
  const editado=copy(reaberto.db);editado.processos[0].conjuge.beneficiarioTitulo='sim';
  assert.equal(prepararEdicao(reaberto.db,editado,reaberto,editado.usuarios[0]).find(o=>o.table==='integracao_moradores').changes.dados.conjuge.beneficiarioTitulo,'sim');
});

test('sequência considera códigos legados, novos e arquivo completo sem renumerar', () => {
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const ctx=vm.createContext({so:s=>s.replace(/\D/g,'')});
  for(const name of ['numeroClienteDe','proximoNumeroCliente']){
    const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n',start);
    vm.runInContext(source.slice(start,end),ctx);
  }
  const processos=[{codigo:'ABC_001',remessaId:'r'},{codigo:'ABC_0002',remessaId:'r'},{codigo:'ABC_10000',remessaId:'r'},{codigo:'OUT_90000',remessaId:'outra'}];
  const antes=JSON.stringify(processos);
  assert.equal(ctx.proximoNumeroCliente({processos:[],_baseArquivo:{processos}},'r'),10001);
  assert.equal(JSON.stringify(processos),antes);
});

test('soltar arquivo usa o mesmo seletor, bloqueia durante análise e oferece botão nativo', () => {
  const source=readFileSync(new URL('../src/SoltarDocumentos.jsx',import.meta.url),'utf8');
  const module={exports:{}};
  vm.runInNewContext(transformSync(source,{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,require:createRequire(import.meta.url)});
  const Componente=module.exports.default;
  let enviados=0,abertos=0,prevenidos=0;
  for(const bloqueado of [false,true]){
    const el=Componente({bloqueado,escolher:()=>enviados++,abrir:()=>abertos++});
    const e={preventDefault:()=>prevenidos++,dataTransfer:{files:[{name:'sintetico.pdf'}]}};
    el.props.onDragOver(e);assert.equal(e.dataTransfer.dropEffect,bloqueado?'none':'copy');el.props.onDrop(e);
    const botao=el.props.children.find(x=>x?.type==='button');assert.equal(botao.props.disabled,bloqueado);
    if(!botao.props.disabled)botao.props.onClick();
  }
  assert.equal(enviados,1);assert.equal(abertos,1);assert.equal(prevenidos,4);
});

test('qualificação de posse inclui somente cônjuge com Sim explícito',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8'),start=source.indexOf('function gerarQualificacao(');
  const ctx=vm.createContext({beneficiarioConjuge,preenchido: Boolean,cpfValido:()=>true,fmtCPF:v=>v,ehPJ:()=>false,cpfDispensado:()=>false,temConjuge:()=>true,codigosUnidades:()=>['ABC_0001']});
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
  const p={requerente:{nome:'Pessoa Sintética',cpf:'111'},conjuge:{nome:'Cônjuge Sintético',cpf:'222',beneficiario:'sim'},corequerentes:[]};
  for(const valor of [undefined,'','nao','sim']){
    p.conjuge.beneficiarioTitulo=valor;
    assert.equal(ctx.gerarQualificacao(p,'simples').texto.includes('Cônjuge Sintético'),valor==='sim');
  }
});

test('reabrir backup v4 preserva códigos legados e seus números de sequência',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const ctx=vm.createContext({so:s=>s.replace(/\D/g,''),compararTextos:(a,b)=>a.localeCompare(b),codigoCliente:()=>{throw Error('Não deve renumerar');}});
  for(const name of ['numeroClienteDe','migrarParaV5']){
    const start=source.indexOf(`function ${name}(`),end=name==='numeroClienteDe'?source.indexOf('\n',start):source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),ctx);
  }
  const n={versao:4,municipios:[{prefixo:'ABC'}],processos:[{id:'1',remessaId:'r',codigo:'ABC_001'},{id:'2',remessaId:'r',codigo:'ABC_10000'}]};
  ctx.migrarParaV5(n);
  assert.deepEqual(n.processos.map(p=>p.codigo),['ABC_001','ABC_10000']);
  assert.deepEqual(n.processos.map(p=>p.numeroCliente),[1,10000]);
});

test('legados preservam Não válido e não inventam proveniência para Sim automático',()=>{
  const legado={beneficiario:'sim',nome:'Legado'};
  assert.equal(beneficiarioConjuge(legado),'');assert.equal(legado.beneficiario,'sim');
  assert.equal(beneficiarioConjuge({beneficiario:'nao'}),'nao');
  assert.equal(beneficiarioConjuge({beneficiario:'nao',beneficiarioTitulo:'sim'}),'sim');
  assert.equal(beneficiarioConjuge({beneficiario:'sim',beneficiarioTitulo:'nao'}),'nao');
  assert.equal(beneficiarioConjuge({beneficiario:'nao',beneficiarioTitulo:''}),'');
});
