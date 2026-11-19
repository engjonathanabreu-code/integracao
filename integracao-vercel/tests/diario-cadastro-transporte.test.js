import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {podeRearmarCadastro} from '../src/estado-sincronizacao.js';

const base=()=>({
 estado:'resultado_desconhecido',proximaTentativa:Number.MAX_SAFE_INTEGER,
 erro:{categoria:'transitoria',codigo:'TRANSPORTE',status:503,rejeicaoConfirmada:false},
 original:{modulo:'processos',intencao:{edicoes:[{colecao:'auditoria',id:'a',antes:{existe:false},depois:{existe:true,valor:{id:'a',acao:'Cadastro alterado'}}}]}}
});
test('cadastro esgotado pode rearmar apenas a intenção com auditoria correspondente',()=>{
 assert.equal(podeRearmarCadastro(base(),'a',100),true);
 assert.equal(podeRearmarCadastro(base(),'outra',100),false);
 for(const status of [null,408,500,502,503,504]){
  const i=base();i.erro.status=status;
  assert.equal(podeRearmarCadastro(i,'a',100),true);
 }
 for(const altera of [
  i=>{i.erro.status=429;},
  i=>{i.erro.categoria='sessao';},
  i=>{i.erro.codigo='LEITURA_DIVERGENTE';},
  i=>{i.erro.rejeicaoConfirmada=true;},
  i=>{i.proximaTentativa=1000;},
  i=>{i.leaseAte=105;},
  i=>{i.recibo={aliases:{}};},
  i=>{i.estado='dispensado';},
  i=>{i.original.modulo='metas';},
  i=>{i.original.intencao.edicoes[0].antes.existe=true;},
  i=>{i.original.intencao.edicoes[0].depois.valor.acao='Unidade alterada';},
 ]){const i=base();altera(i);assert.equal(podeRearmarCadastro(i,'a',100),false);}
});

test('o botão de Clientes retoma a auditoria retida depois de confirmar rede e sessão, sem refazer a edição',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const hook=readFileSync(new URL('../src/use-dados-compartilhados.js',import.meta.url),'utf8');
 assert.match(app,/if \(tentativaCadastro.current\) return confirmarCadastro\(\)/);
 assert.match(app,/"Cadastro alterado".*\{ permitirOffline: true, retomarTransporteCadastro: true \}/);
 const retentativa=hook.slice(hook.indexOf('const acompanhar=async'),hook.indexOf('return acompanhar();'));
 assert.match(retentativa,/if\(gen!==generation\.current\|\|!actor\.current\|\|!temSessao\(\)\)[\s\S]*if\(!temConexao\(\)\)[\s\S]*diario\.current\.rearmarCadastro\(identificada\.id\);conferirGeracao\(gen\);[\s\S]*setTimeout\(flush,0\)/);
 assert.doesNotMatch(retentativa,/(mutate|gravarOperacoes)\(/);
});
