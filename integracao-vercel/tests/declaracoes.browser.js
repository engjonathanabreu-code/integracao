import { DECLARACOES, MODELO_PROTOCOLO, contextoDeclaracao, gerarTextoDeclaracao, camposFaltantesDeclaracao } from '../src/declaracoes.js';
import { lacunasDoDocumento } from '../src/modelos-html.js';
export function testesDeclaracoes(test, assert) {
  const pessoa={nome:'Pessoa Teste',sexo:'Feminino',cpf:'000.000.000-00',rg:'123',rgOrgao:'SSP',rgUf:'SC',nacionalidade:'Brasileira',profissao:'Professora',estadoCivil:'Solteiro(a)'};
  const endereco={logradouro:'Rua Teste',numero:'10',bairro:'Centro',municipio:'Cidade de residência',uf:'SC',cep:'00000-000'};
  const morador={requerente:pessoa,endereco,conjuge:{...pessoa,nome:'Cônjuge Teste',sexo:'Masculino'}};
  const entradas={condicaoSemRenda:'DESEMPREGADO(A)',ocupacaoDeclarada:'estudante e vendedora autônoma',rendaMensal:'1.234,56',declarante:{...pessoa,...endereco,nome:'Terceiro Teste',municipio:'Cidade do terceiro'}};
  for (const [id,modelo] of Object.entries(DECLARACOES)) test(`${modelo.nome}: emissão completa, sem marcadores`,()=>{
    const dados=contextoDeclaracao(morador,entradas,new Date(2026,8,15,12));
    const html=gerarTextoDeclaracao(modelo.corpo,dados);
    assert.equal(lacunasDoDocumento(html).marcadores.length,0); assert.ok(!html.includes('{{'));
    assert.ok(html.includes(id==='dec_endereco'?'Cidade do terceiro':'Cidade de residência'));
    assert.ok(!html.includes('(a)'));
    if(id==='dec_uniao_estavel')assert.equal(new DOMParser().parseFromString(html,'text/html').querySelectorAll('td').length,2);
  });
  test('cadastro incompleto mantém campo e acusa lacuna',()=>{
    const dados=contextoDeclaracao({...morador,requerente:{...pessoa,rg:''}},entradas);
    const corpo=DECLARACOES.dec_estado_civil.corpo;
    assert.ok(gerarTextoDeclaracao(corpo,dados).includes('{{requerente.rg}}'));
    assert.ok(camposFaltantesDeclaracao(corpo,dados).includes('requerente.rg'));
  });
  test('terceiro assina a própria declaração e texto digitado é escapado',()=>{
    const dados=contextoDeclaracao(morador,{...entradas,declarante:{...entradas.declarante,nome:'<img src=x onerror=alert(1)>'}});
    const html=gerarTextoDeclaracao(DECLARACOES.dec_endereco.corpo,dados);
    assert.equal(new DOMParser().parseFromString(html,'text/html').querySelectorAll('img').length,0);
    assert.ok(html.includes('&lt;img'));
  });
  test('requerimento da prefeitura resolve dados por núcleo',()=>{
    const dados={comarca:{nome:'Comarca Teste',estadoPorExtenso:'Santa Catarina'},municipio:{nome:'Cidade Teste',uf:'SC'},prefeitura:{cnpj:'00.000.000/0000-00',endereco:'Sede Teste',prefeito:{nome:'Representante Teste',cargo:'Prefeito'}},nucleo:{nome:'Núcleo Teste'},documento:{dataExtenso:'15 de setembro de 2026'}};
    const html=gerarTextoDeclaracao(MODELO_PROTOCOLO.corpo,dados);
    assert.equal(lacunasDoDocumento(html).marcadores.length,0);
    assert.ok(html.includes('Núcleo Teste'));assert.ok(html.includes('Representante Teste'));assert.ok(!html.includes('Pessoa Teste'));
    delete dados.prefeitura.cnpj;
    assert.ok(camposFaltantesDeclaracao(MODELO_PROTOCOLO.corpo,dados).includes('prefeitura.cnpj'));
  });
}
