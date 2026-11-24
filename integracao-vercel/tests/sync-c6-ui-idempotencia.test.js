// Reprodução C6 (dono da correção: A5): timeout em segundo plano, idempotência por idOperacao e
// salvamento da edição de meta somente com campos alterados.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import {criarConfirmacoesMutacoes} from '../src/confirmacao-mutacoes.js';

const base=()=>({nucleos:[{id:'n',memorial:{texto:'anterior'}}],auditoria:[]});
const mudar=(b,id,fn)=>{const d=structuredClone(b);fn(d);d.auditoria.unshift({id});return d;};
const relogioManual=()=>{const timers=[];return {timers,setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer:()=>{}};};

// Interpretação do contrato C6 ("após o timeout de 45 s, a UI mostra 'enviando em segundo plano'
// (não erro) enquanto o item não exigir revisão"): o resultado do timeout precisa ser distinguível
// de um erro definitivo. Aceita-se `segundoPlano===true` OU `code==='CONFIRMACAO_SEGUNDO_PLANO'`;
// hoje a promessa rejeita com CONFIRMACAO_TIMEOUT sem marcação, igual a qualquer falha.
test('C6: após o timeout o resultado indica envio em segundo plano, não erro definitivo',async()=>{
 const t=relogioManual(),c=criarConfirmacoesMutacoes({timeout:45000,...t});
 const antes=base(),depois=mudar(antes,'op-1',d=>{d.nucleos[0].memorial.texto='novo';});
 const p=c.aguardar('op-1',antes,depois);
 t.timers.shift()();
 let resultado,erro;try{resultado=await p;}catch(e){erro=e;}
 const sinal=resultado??erro;
 assert.ok(sinal?.segundoPlano===true||sinal?.code==='CONFIRMACAO_SEGUNDO_PLANO',
  `timeout devolveu ${erro?'erro':'resultado'} sem indicação de segundo plano: ${JSON.stringify({code:sinal?.code,segundoPlano:sinal?.segundoPlano})}`);
 assert.notEqual(sinal?.confirmado,true,'timeout nunca é confirmação');
 // A confirmação que chega depois continua disponível para a mesma operação.
 c.confirmar(depois,depois,{pedido:'tarde'});
 assert.equal(c.confirmada('op-1'),true);
});

test('C6: repetir aguardar com o mesmo idOperacao retoma a mesma confirmação em vez de lançar',async()=>{
 const t=relogioManual(),c=criarConfirmacoesMutacoes({timeout:45000,...t});
 const antes=base(),depois=mudar(antes,'op-2',d=>{d.nucleos[0].memorial.texto='novo';});
 const p1=c.aguardar('op-2',antes,depois);
 let p2,erro;try{p2=c.aguardar('op-2',antes,depois);}catch(e){erro=e;}
 assert.equal(erro,undefined,`segundo salvamento com o mesmo idOperacao lançou: ${erro?.message}`);
 assert.strictEqual(p2,p1,'deveria retomar a mesma promessa');
 assert.equal(c.tamanho,1,'nenhuma espera adicional');
 c.confirmar(depois,depois,{pedido:'unico'});
 assert.equal((await p2).recibo.pedido,'unico');
 // Depois de confirmada, um novo salvamento com o mesmo id devolve o mesmo resultado.
 let p3;assert.doesNotThrow(()=>{p3=c.aguardar('op-2',antes,depois);});
 assert.equal((await p3).recibo.pedido,'unico');
});

// Análise estática de App.jsx (técnica de tests/app-confirmacao-handlers.test.js), sem montar a App.
const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ast=parse(fonte,{sourceType:'module',plugins:['jsx']});
const no=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='ModalMetaERP');

test('C6: salvar da edição de meta (ModalMetaERP) não copia o formulário inteiro com Object.assign(q, base)',()=>{
 assert.ok(no,'ModalMetaERP não encontrada em App.jsx');
 const corpo=fonte.slice(no.start,no.end);
 const i=corpo.indexOf('"Meta editada"');assert.ok(i>0,'ramo de edição ("Meta editada") não encontrado');
 const ramo=corpo.slice(corpo.lastIndexOf('criarConfirmacaoMeta',i),i);
 assert.doesNotMatch(ramo,/Object\.assign\(\s*q\s*,\s*base\s*\)/,'a edição sobrescreve todos os campos da meta com o formulário (inclusive os não alterados)');
});
