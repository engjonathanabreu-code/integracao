import test from 'node:test';
import assert from 'node:assert/strict';
import { unidadesParaMemoriais, salvarUnidadeMemorial, salvarConfiguracaoMemoriais, contextoDocumentoMemorial } from '../memoriais/integracaoMemoriais.js';
import { processarVertices } from '../memoriais/memoriaisCalculos.js';
import { montarMemorial } from '../memoriais/memoriaisTexto.js';
import { fixture, blank, id } from './fixture.js';
import { projetar, prepararEdicao, copy } from '../src/dados-compartilhados.js';
const poligono=processarVertices([{nome:'A',e:0,n:0},{nome:'B',e:0,n:100},{nome:'C',e:100,n:100},{nome:'D',e:100,n:0}]);
const dados={...poligono,memorial:montarMemorial(poligono.vertices,{meridiano:'51° WGr'})};
const unidade={id:'u1',area:'9',memorial:'Memorial manual anterior',caracteristicas:'Casa',outro:'preservar'};
const morador={id:'morador1',nucleoId:'n1',codigo:'M001',requerente:{nome:'Pessoa teste'},enderecoImovel:{logradouro:'Rua teste'},qualificacao:{textos:{memorial:'Qualificação do cadastro'}},unidades:[unidade,{id:'u2',memorial:'Segunda unidade',campoExtra:{x:1}}],outraSecao:{valor:10}};
test('lista contém uma entrada por unidade, qualificação/endereço do imóvel e identidade sem colisão',()=>{
 const lista=unidadesParaMemoriais([morador,{...morador,id:'morador2'}, {...morador,id:'resumo',_resumo:true}], 'n1');
 assert.equal(lista.length,4);assert.equal(new Set(lista.map(u=>u.id)).size,4);
 assert.equal(lista[0].codigo,'M001A');assert.equal(lista[1].codigo,'M001B');
 assert.equal(lista[0].morador.dados.qualificacaoRequerente.quali_memorial,'Qualificação do cadastro');
 assert.equal(lista[0].morador.dados.enderecoImovel.logradouro,'Rua teste');
});
test('salva só os quatro campos, preserva características, morador e unidades irmãs',()=>{
 const db={processos:[copy(morador)]}, anterior=copy(db), u=unidadesParaMemoriais(db.processos,'n1')[0];
 db.processos[0].unidades[0].novaInformacao='recebida durante edição';
 salvarUnidadeMemorial(db,u,dados,'n1');
 assert.equal(db.processos[0].unidades[0].area,10000);assert.equal(db.processos[0].unidades[0].perimetro,400);
 assert.equal(db.processos[0].unidades[0].caracteristicas,'Casa');assert.equal(db.processos[0].unidades[0].outro,'preservar');assert.equal(db.processos[0].unidades[0].novaInformacao,'recebida durante edição');
 assert.deepEqual(db.processos[0].unidades[1],anterior.processos[0].unidades[1]);assert.deepEqual(db.processos[0].outraSecao,anterior.processos[0].outraSecao);
 assert.equal(anterior.processos[0].unidades[0].memorial,'Memorial manual anterior');
});
test('não apaga memorial revisado em outra tela nem recria unidade removida',()=>{
 const db={processos:[copy(morador)]},u=unidadesParaMemoriais(db.processos,'n1')[0];
 db.processos[0].unidades[0].memorial='Revisão concorrente';assert.throws(()=>salvarUnidadeMemorial(db,u,dados,'n1'),/mudou/);
 assert.equal(db.processos[0].unidades[0].memorial,'Revisão concorrente');
 db.processos[0].unidades=[];assert.throws(()=>salvarUnidadeMemorial(db,u,dados,'n1'),/disponível/);
});
test('operações reais do projeto só escrevem integracao_moradores com verificação da versão anterior',()=>{
 const base=fixture();base.integracao_moradores.push({colecao:'processos',registro_id:id(4),dados:{id:id(4),nucleoId:id(5),unidades:copy(morador.unidades),outraSecao:{intacta:true}},criado_por:id(1),referencia_tabela:'fin_receb_clientes',referencia_id:id(4)});
 const estado=projetar(base,blank()),depois=copy(estado.db),u=unidadesParaMemoriais(depois.processos,id(5))[0];
 salvarUnidadeMemorial(depois,u,dados,id(5));const ops=prepararEdicao(estado.db,depois,estado,estado.db.usuarios[0]);
 assert.equal(ops.length,1);assert.equal(ops[0].table,'integracao_moradores');
 assert.equal(ops[0].expected.dados.unidades[0].memorial,'Memorial manual anterior');
 assert.deepEqual(ops[0].changes.dados.outraSecao,{intacta:true});
 assert.deepEqual(ops[0].changes.dados.unidades[1],morador.unidades[1]);
});
test('configuração usa apenas novo registro config/memoriais, preservando configurações alheias',()=>{
 const base=fixture(),estado=projetar(base,blank()),depois=copy(estado.db);
 depois.advogados=[{id:'adv',nome:'Existente'}];estado.db.advogados=copy(depois.advogados);
 salvarConfiguracaoMemoriais(depois,{sistema:'UTM',meridiano:'51° WGr',prefixo:'V',responsavel:{nome:'Técnico',registro:'CREA teste'}});
 const ops=prepararEdicao(estado.db,depois,estado,estado.db.usuarios[0]);
 assert.equal(ops.length,1);assert.equal(ops[0].table,'integracao_configuracoes');assert.deepEqual(ops[0].key,{colecao:'config',registro_id:'memoriais'});
 assert.equal(ops[0].changes.dados.valor.responsavel.nome,'Técnico');assert.deepEqual(depois.advogados,estado.db.advogados);
});
test('marcadores planos são adaptados ao motor existente e recebem a data de emissão',()=>{
 const dados=contextoDocumentoMemorial({'unidade.area':'10.000,00','qualificacao.memorial':'Pessoa','imovel.cep':'','__proto__.poluido':true},new Date(2026,8,16,12));
 assert.equal(dados.unidade.area,'10.000,00');assert.equal(dados.imovel.cep,'');assert.equal(dados.documento.dataExtenso,'16 de setembro de 2026');assert.equal({}.poluido,undefined);
});
