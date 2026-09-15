import test from 'node:test';
import assert from 'node:assert/strict';
import { DECLARACOES, entradasDeclaracao, contextoDeclaracao, pessoaDeclaracao, impedimentoDeclaracao, datasDocumento } from '../src/declaracoes.js';
import { contarProcuracoes } from '../src/representantes.js';
import { projetar, prepararEdicao, copy } from '../src/dados-compartilhados.js';
import { fixture, blank, id } from './fixture.js';

test('cinco declarações, com IDs existentes preservados e protocolo separado', () => {
  assert.equal(Object.keys(DECLARACOES).length,5);
  for (const chave of ['dec_estado_civil','dec_renda','dec_endereco']) assert.ok(DECLARACOES[chave]);
  assert.equal(DECLARACOES.requerimento_protocolo,undefined);
});
test('concordância por pessoa, sem adivinhar sexo ausente', () => {
  const mulher=pessoaDeclaracao({sexo:'Feminino',nacionalidade:'Brasileira',estadoCivil:'Solteiro(a)'});
  assert.equal(mulher.tratamento,'Sra.'); assert.equal(mulher.inscrito,'inscrita'); assert.equal(mulher.portador,'portadora'); assert.equal(mulher.estadoCivil,'Solteira');
  assert.equal(pessoaDeclaracao({sexo:'Masculino',nacionalidade:'Brasileira'}).nacionalidade,'brasileiro');
  assert.equal(pessoaDeclaracao({}).tratamento,undefined);
});
test('restrições de estado civil e cônjuge são aplicadas antes da emissão', () => {
  assert.match(impedimentoDeclaracao('dec_uniao_estavel',{requerente:{estadoCivil:'União estável'}}),/cônjuge/);
  assert.equal(impedimentoDeclaracao('dec_uniao_estavel',{social:{estadoCivil:'União estável'},conjuge:{nome:'Pessoa'}}),'');
  assert.equal(impedimentoDeclaracao('dec_estado_civil',{requerente:{estadoCivil:'solteira'}}),'');
  assert.ok(impedimentoDeclaracao('dec_estado_civil',{requerente:{estadoCivil:'Casado(a)'}}));
});
test('renda individual é pré-preenchida; entradas anteriores do mesmo documento são reaproveitadas', () => {
  const p={requerente:{renda:0},social:{rendaFamiliar:9000},documentosGerados:[{tipo:'dec_endereco',entradas:{declarante:{nome:'Terceiro'}}}]};
  assert.equal(entradasDeclaracao(p,'dec_renda').rendaMensal,0);
  assert.equal(entradasDeclaracao(p,'dec_endereco').declarante.nome,'Terceiro');
  assert.equal(entradasDeclaracao(p,'dec_renda').declarante.nome,undefined);
  assert.equal(contextoDeclaracao(p,{rendaMensal:0}).requerente.rendaMensal.replace(/\s/g,''),'R$0,00');
  assert.equal(contextoDeclaracao(p,{rendaMensal:''}).requerente.rendaMensal,undefined);
  assert.equal(contextoDeclaracao(p,{rendaMensal:'-1'}).requerente.rendaMensal,undefined);
});
test('datas sem cidade embutida e endereço residencial preservado', () => {
  assert.deepEqual(datasDocumento(new Date(2026,8,15,12)),{data:'15/09/2026',dataExtenso:'15 de setembro de 2026'});
  assert.equal(contextoDeclaracao({endereco:{municipio:'Residência'},requerente:{}},{declarante:{municipio:'Terceiro'}}).endereco.municipio,'Residência');
});
test('contagem de procurações considera IDs, nomes antigos e uma ocorrência por documento', () => {
  const representante={id:'a',nome:'Ana Teste',ativo:false};
  const processos=[{documentosGerados:[{tipo:'procuracao',representantes:[representante],condicoes:'para Ana Teste'},{tipo:'procuracao',condicoes:'para Ana Teste, Outro'},{tipo:'contrato',condicoes:'Ana Teste'}]}];
  assert.equal(contarProcuracoes(processos,representante),2);
  assert.equal(contarProcuracoes(processos,{id:'b',nome:'Nunca Usado'}),0);
  assert.equal(processos[0].documentosGerados[1].condicoes,'para Ana Teste, Outro');
});
test('excluir representante importado altera a configuração compartilhada e permanece após recarregar', () => {
  const base=fixture();
  base.integracao_complementos.push({colecao:'config',registro_id:'advogados',dados:{valor:[{id:'a',nome:'Nunca usado'},{id:'b',nome:'Mantido'}]},criado_por:id(1),referencia_tabela:'integracao_config'});
  const estado=projetar(base,blank()), depois=copy(estado.db);
  depois.advogados=depois.advogados.filter(a=>a.id!=='a');
  const ops=prepararEdicao(estado.db,depois,estado,estado.db.usuarios[0]);
  const op=ops.find(o=>o.key.registro_id==='advogados');
  assert.deepEqual(op.changes.dados.valor,[{id:'b',nome:'Mantido'}]);
  base.integracao_complementos.find(e=>e.registro_id==='advogados').dados=op.changes.dados;
  assert.deepEqual(projetar(base,blank()).db.advogados,[{id:'b',nome:'Mantido'}]);
});
test('dados de prefeitura e histórico do núcleo são gravados nos complementos existentes', () => {
  const base=fixture(), estado=projetar(base,blank()), depois=copy(estado.db);
  depois.ajustesMunicipio={ [id(2)]:{prefeitura:{cnpj:'00.000.000/0000-00',endereco:'Sede',prefeito:{nome:'Prefeito',cargo:'Prefeito'}},comarca:{nome:'Comarca',estadoPorExtenso:'Santa Catarina'}} };
  depois.nucleos[0].documentosGerados=[{id:'emissao',tipo:'requerimento_protocolo',por:'Equipe',data:'2026-09-15',html:'Documento'}];
  const ops=prepararEdicao(estado.db,depois,estado,estado.db.usuarios[0]);
  assert.ok(ops.some(o=>o.key.registro_id==='ajustesMunicipio' && o.changes.dados.valor[id(2)].prefeitura.prefeito.nome==='Prefeito'));
  assert.ok(ops.some(o=>o.key.colecao==='nucleos' && o.changes.dados.documentosGerados[0].tipo==='requerimento_protocolo'));
  assert.ok(!ops.some(o=>o.key.colecao==='processos'));
});
test('nome parecido não aumenta a contagem e estado civil do requerente prevalece', () => {
  assert.equal(contarProcuracoes([{documentosGerados:[{tipo:'procuracao',condicoes:'para Mariana Silva'}]}],{id:'ana',nome:'Ana Silva'}),0);
  assert.equal(impedimentoDeclaracao('dec_uniao_estavel',{requerente:{estadoCivil:'União estável'},social:{estadoCivil:'Solteiro(a)'},conjuge:{nome:'Companheiro'}}),'');
});
