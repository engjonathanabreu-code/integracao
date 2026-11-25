import test from 'node:test';
import assert from 'node:assert/strict';
import {projetar,prepararEdicao,documentoAoTrocarTipoPessoa,copy} from '../src/dados-compartilhados.js';
import {alteracoesConfirmadas} from '../src/confirmacao-mutacoes.js';
import {fixture,blank,id} from './fixture.js';

const CPF='52998224725',CNPJ='11222333000181';
function base({pj=false,documento=CPF}={}){
 const b=fixture();b.fin_receb_clientes[0].cpf_cnpj=documento;
 if(pj)b.integracao_complementos.push({colecao:'processos',registro_id:id(4),referencia_tabela:'fin_receb_clientes',referencia_id:id(4),dados:{requerente:{tipoPessoa:'juridica',representante:'Pessoa fictícia'}}});
 return b;
}
const aplicar=(b,ops)=>{const n=copy(b);for(const op of ops){
 if(op.table==='fin_receb_clientes')Object.assign(n.fin_receb_clientes.find(r=>r.id===op.key.id),op.changes);
 else if(op.key?.colecao){const atual=n.integracao_complementos.find(r=>r.colecao===op.key.colecao&&r.registro_id===op.key.registro_id);
  if(atual)atual.dados=op.changes.dados;else n.integracao_complementos.push({...op.key,...op.changes});}
}return n;};

test('EDI-C2: trocar de pessoa física para jurídica grava o CNPJ no documento oficial, na mesma gravação',()=>{
 const b=base(),state=projetar(b,blank()),novo=copy(state.db),ficha=novo.processos[0];
 assert.equal(ficha.requerente.cpf,CPF);
 ficha.requerente.tipoPessoa='juridica';ficha.requerente.cnpj=CNPJ;
 const ops=prepararEdicao(state.db,novo,state,state.db.usuarios[0]);
 const canonica=ops.filter(o=>o.table==='fin_receb_clientes');
 assert.equal(canonica.length,1);
 assert.deepEqual(canonica[0].changes,{cpf_cnpj:CNPJ});
 assert.deepEqual(canonica[0].expected,{cpf_cnpj:CPF},'a troca confere o documento anterior');
 assert.ok(ops.some(o=>o.key?.colecao==='processos'&&o.changes?.dados?.requerente?.tipoPessoa==='juridica'),'o tipo segue no mesmo lote');
 // Releitura: o documento oficial volta como CNPJ e a confirmação do salvamento fecha.
 const relido=projetar(aplicar(b,ops),blank()).db;
 assert.equal(relido.processos[0].requerente.cnpj,CNPJ);assert.equal(relido.processos[0].requerente.cpf,'');
 assert.equal(alteracoesConfirmadas(state.db,novo,relido,{},ops),true);
});

test('EDI-C2: trocar de jurídica para física grava o CPF informado',()=>{
 const b=base({pj:true,documento:CNPJ}),state=projetar(b,blank()),novo=copy(state.db),ficha=novo.processos[0];
 assert.equal(ficha.requerente.cnpj,CNPJ);
 ficha.requerente.tipoPessoa='fisica';ficha.requerente.cpf=CPF;
 const canonica=prepararEdicao(state.db,novo,state,state.db.usuarios[0]).filter(o=>o.table==='fin_receb_clientes');
 assert.deepEqual(canonica.map(o=>[o.changes,o.expected]),[[{cpf_cnpj:CPF},{cpf_cnpj:CNPJ}]]);
});

test('EDI-C2: sem documento novo, a troca de tipo não apaga o documento oficial; sem troca nada muda',()=>{
 const b=base(),state=projetar(b,blank());
 const semDocumento=copy(state.db);semDocumento.processos[0].requerente.tipoPessoa='juridica';
 assert.deepEqual(prepararEdicao(state.db,semDocumento,state,state.db.usuarios[0]).filter(o=>o.table==='fin_receb_clientes'),[]);
 const soCpf=copy(state.db);soCpf.processos[0].requerente.cpf='39053344705';
 assert.deepEqual(prepararEdicao(state.db,soCpf,state,state.db.usuarios[0]).filter(o=>o.table==='fin_receb_clientes').map(o=>o.changes),[{cpf_cnpj:'39053344705'}]);
 const pf={requerente:{tipoPessoa:'fisica',cpf:CPF,cnpj:CNPJ}},pj={requerente:{tipoPessoa:'juridica',cpf:CPF,cnpj:CNPJ}};
 assert.equal(documentoAoTrocarTipoPessoa(pf,pf),undefined);
 assert.equal(documentoAoTrocarTipoPessoa({requerente:{cpf:CPF}},pf),undefined,'tipo vazio já é pessoa física');
 assert.equal(documentoAoTrocarTipoPessoa(pf,pj),CNPJ);assert.equal(documentoAoTrocarTipoPessoa(pj,pf),CPF);
 assert.equal(documentoAoTrocarTipoPessoa(pf,{requerente:{tipoPessoa:'juridica',cnpj:'  '}}),undefined);
});
