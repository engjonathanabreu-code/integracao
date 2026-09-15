import { prepararModeloPRF, contextoPRF, encontrarLacunas, montarPRF, mapaDoModeloPRF } from '../src/modelos-prf.js';
import { aplicarCondicionais, expandirLacos, lacunasDoDocumento, APELIDOS, substituirCaminhos } from '../src/modelos-html.js';
const gerar = (html, dados) => expandirLacos(aplicarCondicionais(html, dados), dados);
const doc = html => new DOMParser().parseFromString(html, 'text/html');
export function testesModelos(test, assert) {
  test('três moradores clonam a linha inteira', () => {
    const html = gerar('<table><tr><td>{{#cada:unidades}}{{unidade.nome}}</td><td>{{unidade.quadra}}{{/cada}}</td></tr></table>', {unidades:[{nome:'A',quadra:1},{nome:'B',quadra:2},{nome:'C',quadra:3}]});
    assert.equal(doc(html).querySelectorAll('tr').length, 3); assert.equal(doc(html).body.textContent, 'A1B2C3'); assert.ok(!html.includes('{{'));
  });
  test('coleção vazia remove a linha-modelo', () => {
    const html = gerar('<table><tr><td>{{#cada:unidades}}{{unidade.quadra}}</td><td>{{/cada}}</td></tr></table>', {unidades:[]});
    assert.equal(doc(html).querySelectorAll('tr').length, 0); assert.ok(!html.includes('{{'));
  });
  test('duas matrículas com três unidades geram duas tabelas', () => {
    const html = gerar('<p>{{#cada:matriculas}}</p><h2>{{matricula.numero}}</h2><table><tr><td>{{#cada:matricula.unidades}}{{unidade.nome}}</td><td>{{/cada}}</td></tr></table><p>{{/cada}}</p>', {matriculas:[{numero:'M1',unidades:[{nome:'A'},{nome:'B'},{nome:'C'}]},{numero:'M2',unidades:[{nome:'D'},{nome:'E'},{nome:'F'}]}]});
    assert.equal(doc(html).querySelectorAll('table').length,2); for(const t of doc(html).querySelectorAll('table')) assert.equal(t.rows.length,3);
    assert.equal(doc(html).querySelectorAll('p').length,0);
  });
  test('laço na mesma célula repete conteúdo inline', () => {
    const html = gerar('<table><tr><td>{{#cada:unidades}}{{item.nome}};{{/cada}}</td></tr></table>',{unidades:[{nome:'A'},{nome:'B'}]});
    assert.equal(doc(html).querySelectorAll('tr').length,1);assert.equal(doc(html).querySelector('td').textContent,'A;B;');
  });
  test('laço inline preserva texto fora do trecho', () => {
    assert.equal(doc(gerar('<p>Antes {{#cada:unidades}}<b>{{unidade.nome}}</b>;{{/cada}} depois</p>',{unidades:[{nome:'A'},{nome:'B'}]})).body.textContent,'Antes A;B; depois');
  });
  test('bloco entre linhas inclui as duas pontas', () => {
    const html = gerar('<table><tr><td>Cabeçalho</td></tr><tr><td>{{#cada:unidades}}{{item.nome}}</td></tr><tr><td>Meio</td></tr><tr><td>Fim{{/cada}}</td></tr></table>',{unidades:[{nome:'A'},{nome:'B'}]});
    assert.equal(doc(html).querySelectorAll('tr').length,7); assert.equal(doc(html).body.textContent,'CabeçalhoAMeioFimBMeioFim');
  });
  test('condicionais com e sem alternativa não deixam parágrafos vazios', () => {
    const html='<p>{{#se:ativo}}</p><p>Sim</p><p>{{senao}}</p><table><tr><td>Não</td></tr></table><p>{{/se}}</p>';
    assert.equal(doc(gerar(html,{ativo:true})).body.textContent,'Sim');assert.equal(doc(gerar(html,{ativo:true})).querySelectorAll('table').length,0);
    assert.equal(doc(gerar(html,{ativo:false})).body.textContent,'Não');assert.equal(doc(gerar(html,{ativo:false})).querySelectorAll('p').length,0);
    assert.equal(gerar('<p>{{#se:ativo}}Texto{{/se}}</p>',{ativo:false}),'');
    assert.equal(gerar('<p><b>{{#se:ativo}}</b>Texto<i>{{/se}}</i></p>',{ativo:false}),'');
    assert.equal(doc(gerar('<p>A {{#se:ativo}}Sim{{senao}}Não{{/se}} Z</p>',{ativo:false})).body.textContent,'A Não Z');
  });
  test('condicional aninhado de cronograma e modalidade', () => {
    const html='<p>{{#se:cronograma}}Início {{#se:social}}Social{{senao}}Específica{{/se}} fim{{/se}}</p>';
    assert.equal(doc(gerar(html,{cronograma:true,social:true})).body.textContent,'Início Social fim');
    assert.equal(doc(gerar(html,{cronograma:true,social:false})).body.textContent,'Início Específica fim');
    assert.equal(gerar(html,{cronograma:false,social:true}),'');
  });
  test('marcadores divididos entre tags do Word', () => {
    const html=gerar('<table><tr><td><b>{{#ca</b>da:unidades}}<i>{{uni</i>dade.nome}}</td><td>{{/ca<b>da}}</b></td></tr></table>',{unidades:[{nome:'A'},{nome:'B'}]});
    assert.equal(doc(html).querySelectorAll('tr').length,2);assert.equal(doc(html).body.textContent,'AB');
  });
  test('caminhos ausentes, vazios e valores especiais', () => {
    const html=gerar('<p>{{nucleo.nome}} {{municipio.leiReurb.data}} {{nucleo.area}} {{nucleo.zero}}</p>',{nucleo:{nome:'<Rua & Cia>',area:' ',zero:0}});
    assert.equal(doc(html).body.textContent,'<Rua & Cia> {{municipio.leiReurb.data}} {{nucleo.area}} 0');
    assert.equal(lacunasDoDocumento(html).marcadores.join(','),'municipio.leiReurb.data,nucleo.area');
  });
  test('lacunas de item não herdam o valor do item pai', () => {
    const html=gerar('<div>{{#cada:matriculas}}{{#cada:matricula.unidades}}{{item.nome}}{{/cada}}{{/cada}}</div>',{matriculas:[{nome:'PAI',unidades:[{}]}]});
    assert.equal(doc(html).body.textContent,'{{item.nome}}');
  });
  test('condicional dentro de laço resolve o item', () => {
    const html=gerar('<p>{{#cada:unidades}}{{#se:unidade.ativo}}{{unidade.nome}}{{senao}}Não{{/se}};{{/cada}}</p>',{unidades:[{nome:'A',ativo:true},{nome:'B',ativo:false}]});
    assert.equal(doc(html).body.textContent,'A;Não;');
  });
  test('todos os apelidos e item genérico', () => {
    for(const [colecao,apelido] of Object.entries(APELIDOS)) {
      const dados={};let alvo=dados;const partes=colecao.split('.');for(const p of partes.slice(0,-1))alvo=alvo[p]={};alvo[partes.at(-1)]=[{nome:'Teste'}];
      assert.equal(doc(gerar(`<p>{{#cada:${colecao}}}{{${apelido}.nome}}/{{item.nome}}{{/cada}}</p>`,dados)).body.textContent,'Teste/Teste');
    }
  });
  test('controle não é lacuna e marca-texto permanece', () => {
    assert.equal(lacunasDoDocumento('<p>{{#se:a}}{{senao}}{{/se}}{{#cada:unidades}}{{/cada}}{{nucleo.nome}}</p>').marcadores.join(','),'nucleo.nome');
    assert.ok(gerar('<p>{{#se:a}}<mark>Decisão humana</mark>{{/se}}</p>',{a:true}).includes('<mark>Decisão humana</mark>'));
  });
  test('controles malformados interrompem a geração', () => {
    assert.throws(()=>gerar('<p>{{#cada:unidades}}Sem fechamento</p>',{unidades:[]}));
    assert.throws(()=>gerar('<p>{{#se:a}}{{/cada}}</p>',{a:true}));
  });
  test('PRF com laços irmãos de unidades, vias e remanescentes', () => {
    const html=gerar('<p>{{#cada:matriculas}}</p><table><tr><td>{{#cada:matricula.unidades}}{{unidade.nome}}</td><td>{{/cada}}</td></tr><tr><td>{{#cada:matricula.logradouros}}{{logradouro.nome}}</td><td>{{/cada}}</td></tr><tr><td>{{#cada:matricula.remanescentes}}{{remanescente.nome}}</td><td>{{/cada}}</td></tr></table><p>{{/cada}}</p>',{matriculas:[{unidades:[{nome:'U1'},{nome:'U2'}],logradouros:[{nome:'Rua'}],remanescentes:[]},{unidades:[],logradouros:[],remanescentes:[{nome:'Área'}]}]});
    assert.equal(doc(html).querySelectorAll('table').length,2);assert.equal(doc(html).querySelectorAll('tr').length,4);assert.equal(doc(html).body.textContent,'U1U2RuaÁrea');
  });
  test('condicional exclui linhas inteiras do ramo descartado', () => {
    const html=gerar('<table><tr><td>{{#se:ativo}}</td></tr><tr><td>Sim</td></tr><tr><td>{{senao}}</td></tr><tr><td>Não</td></tr><tr><td>{{/se}}</td></tr></table>',{ativo:false});
    assert.equal(doc(html).querySelectorAll('tr').length,1);assert.equal(doc(html).body.textContent,'Não');
  });
  test('PRF expande, calcula lacunas e insere blocos legados sem escapar HTML', () => {
    const html='<h1>{{municipio.nome}}</h1><p>{{#se:modalidadeSocial}}Social{{/se}}</p><table><tr><td>{{#cada:unidades}}{{unidade.nome}}</td><td>{{unidade.cpf}}</td><td>{{unidade.ausente}}{{/cada}}</td></tr></table><p>{{bloco.infraestrutura}}</p><p>Responsável: ______</p><mark>Revisar alternativa</mark>';
    const valores={'municipio.nome':'Cidade &amp; teste','bloco.infraestrutura':'<table><tr><td>Água</td></tr></table>','nucleo.responsavel':'Equipe teste'};
    const estrutura=contextoPRF({municipio:{nome:'Cidade & teste'},nucleo:{},unidades:[{nome:'A',cpf:'123',modalidade:'REURB-S'},{nome:'B',cpf:'456',modalidade:'REURB-S'}],cpfDe:()=> '***'});
    const preparo=prepararModeloPRF(html,{valores,estrutura}),lacunas=encontrarLacunas(preparo.html);
    const mapa=mapaDoModeloPRF(null,preparo,lacunas);mapa[lacunas.find(l=>!l.explicita).id]='nucleo.responsavel';
    const resultado=montarPRF(preparo.html,lacunas,mapa,valores), d=doc(resultado.html);
    assert.equal(d.querySelectorAll('table').length,2);assert.equal(d.querySelectorAll('tr').length,3);
    assert.ok(d.body.textContent.includes('Social'));assert.ok(d.body.textContent.includes('Equipe teste'));assert.equal(d.querySelector('mark').textContent,'Revisar alternativa');
    assert.equal(resultado.faltando.length,2);assert.equal(lacunasDoDocumento(resultado.html).marcadores.join(','),'unidade.ausente');
    assert.ok(!resultado.html.includes('123'));assert.ok(!resultado.html.includes('456'));assert.ok(!resultado.html.includes('#cada'));
  });
  test('PRF sem lacunas restantes tem prévia automática e aceita coleção vazia', () => {
    const dados={valores:{},estrutura:{unidades:[]}};
    const preparo=prepararModeloPRF('<table><tr><td>{{#cada:unidades}}{{unidade.nome}}</td><td>{{/cada}}</td></tr></table>',dados);
    const lacunas=encontrarLacunas(preparo.html),mapa=mapaDoModeloPRF(null,preparo,lacunas);
    assert.ok(mapa);assert.equal(lacunas.length,0);assert.equal(doc(montarPRF(preparo.html,lacunas,mapa,{}).html).querySelectorAll('tr').length,0);
  });
  test('PRF inválido retorna aviso sem interromper a página', () => {
    const preparo=prepararModeloPRF('<p>{{#cada:unidades}}</p>',{valores:{},estrutura:{unidades:[]}});
    assert.ok(preparo.erro);assert.equal(preparo.html,null);assert.equal(mapaDoModeloPRF(null,preparo,[]),null);
  });
  test('HTML legado não é reserializado', () => {
    const html="<p class='modelo'>{{nome}}<br/>{{cpf}}</p>\n{{p:Texto}}";
    assert.equal(gerar(html,{}),html);assert.equal(substituirCaminhos(html,{}),html);
  });
}
