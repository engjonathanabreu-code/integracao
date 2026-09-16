import test from 'node:test';
import assert from 'node:assert/strict';
import { medidasPRF,numeroExtenso,complementoNucleoPRF,CRONOGRAMA_PRF } from '../src/cadastros-prf.js';
import { marcadoresPRF } from '../municipio-prf/marcadoresPRF.js';
test('área e perímetro têm partes decimais por extenso sem arredondar separadamente',()=>{
 const d=medidasPRF({area:1234.56,perimetro:99.995});
 assert.equal(d.area,'1.234,56');assert.equal(d.areaMetrosExtenso,'mil duzentos e trinta e quatro');assert.equal(d.areaDecimetrosExtenso,'cinquenta e seis');
 assert.equal(d.perimetro,'100,00');assert.equal(d.perimetroMetrosExtenso,'cem');assert.equal(d.perimetroCentimetrosExtenso,'zero');
 assert.deepEqual(medidasPRF({area:null}),{});assert.equal(numeroExtenso(1000000),'um milhão');
});
test('áreas não se misturam e cronograma diferencia não informado de Não',()=>{
 const d=complementoNucleoPRF({memorial:{area:200,perimetro:60,vias:[{tipo:'app',area:10,perimetro:12},{tipo:'risco',area:20,perimetro:18},{nome:'Rua A',area:30,perimetro:24}]},cronograma:{redeAgua:true,redeAguaPrazo:'6 meses',drenagem:false},infra:{redeAgua:{presente:true,vias:'Rua A',via1:'A',via2:'B'}}});
 assert.equal(d.marcadores['areaApp.area'],'10,00');assert.equal(d.marcadores['areaRisco.area'],'20,00');assert.equal(d.marcadores['logradouro.area'],'30,00');
 assert.equal(d.estrutura.cronograma.drenagem,false);assert.equal(d.estrutura.cronograma.esgoto,undefined);assert.equal(d.marcadores['cronograma.redeAguaPrazo'],'6 meses');assert.equal(d.marcadores['infra.redeAgua.vias'],'Rua A');
});
test('lote e quadra explícitos prevalecem sobre legado e bairro vem do endereço',()=>{
 const d=marcadoresPRF({nucleo:{dados:{endereco:{bairro:'Centro'}}},moradores:[{unidades:[{id:'u',lote:'2',quadra:'C',loteQuadra:'Lote 1, Quadra B'}]}]});
 assert.equal(d.unidades[0].lote,'2');assert.equal(d.unidades[0].quadra,'C');assert.equal(d.marcadores['nucleo.bairro'],'Centro');
});
test('cadastro municipal alimenta os marcadores de leis e concessionárias',()=>{
 const d=marcadoresPRF({dadosPRF:{leiReurb:{numero:'123',data:'2020-01-02'},planoDiretor:{numero:'321',data:'2021-02-03',artigoMacrozona:'5',citacaoMacrozona:'Texto legal'},concessionariaAgua:{nome:'Água',anoCriacao:'1970',leiContratoNumero:'456',leiContratoData:'2020-01-02'},concessionariaEnergia:{nome:'Energia',tipo:'Pública'}}});
 for(const k of ['municipio.leiReurb.numero','municipio.leiReurb.numeroAno','municipio.leiReurb.data','municipio.planoDiretor.numero','municipio.planoDiretor.data','municipio.planoDiretor.citacaoMacrozona','concessionaria.nome','concessionariaAgua.leiContrato.numero','concessionariaAgua.leiContrato.data','concessionariaEnergia.tipo'])assert.ok(d.marcadores[k],k);
});

import { fixture,blank } from './fixture.js';
import { projetar,copy,prepararEdicao } from '../src/dados-compartilhados.js';
test('cadastros PRF novos escrevem apenas complementos do Integração',()=>{
 const state=projetar(fixture(),blank()), d=copy(state.db);
 d.municipios[0].prf={concessionariaAgua:{nome:'Água'}};
 d.nucleos[0].infra={redeAgua:{presente:true,vias:'Rua A'}};
 d.nucleos[0].cronograma={redeAgua:true,redeAguaPrazo:'6 meses'};
 d.processos[0].unidades=[{id:'u',lote:'1',quadra:'A',area:'100',memorial:'texto'}];
 const ops=prepararEdicao(state.db,d,state,d.usuarios[0]);
 assert.ok(ops.length);assert.ok(ops.every(o=>['integracao_municipios','integracao_nucleos','integracao_moradores'].includes(o.table)));
});
