import { aplicarCondicionais, expandirLacos, lacunasDoDocumento } from './modelos-html.js';

const p = (texto) => `<p style="text-align:justify;margin:0 0 10px">${texto}</p>`;
const titulo = (texto) => `<h1 style="text-align:center;font-size:15pt;margin:0 0 20px">${texto}</h1>`;
const fecho = p('Assim sendo, por ser o aqui exposto a mais pura expressão da verdade, assino esta declaração para que produza efeitos legais.');
const ciencia = p('Declaro ainda estar ciente de que, se comprovada, a qualquer tempo, fraude ou falsidade, em prova ou declaração, estarei {{requerente.sujeito}} a sanções cíveis, criminais e/ou administrativas, conforme dispõe o artigo 2º da Lei 7.115, de 29 de agosto de 1983, estando ciente das penalidades previstas no Código Penal Brasileiro, artigos 171 e 229.');
const assinatura = (pessoa, cpf = true) => `<div style="text-align:center;margin-top:40px"><div style="border-top:1px solid #333;padding-top:8px">{{${pessoa}.nome}}</div>${cpf ? 'CPF: ' : ''}{{${pessoa}.cpf}}</div>`;
const data = p('{{endereco.municipio}}/{{endereco.uf}}, {{documento.data}}.');
const rg = '{{requerente.rg}} {{requerente.rgOrgao}}/{{requerente.rgUf}}';
const endereco = '{{endereco.logradouro}}, {{endereco.numero}}, {{endereco.bairro}}, na cidade de {{endereco.municipio}}/{{endereco.uf}}, {{endereco.cep}}';
const pessoa = '{{requerente.tratamento}} {{requerente.nome}}, {{requerente.nacionalidade}}';
export const DECLARACOES = {
  dec_estado_civil: { nome: 'Declaração de Estado Civil (solteiro)', corpo: titulo('DECLARAÇÃO DE ESTADO CIVIL') +
    p(`Eu, ${pessoa}, {{requerente.profissao}}, {{requerente.solteiro}}, devidamente {{requerente.inscrito}} no CPF nº {{requerente.cpf}} e {{requerente.portador}} do RG nº ${rg}, residente e {{requerente.domiciliado}} à ${endereco}, juridicamente capaz, declaro para os devidos fins e efeitos legais de direito que meu estado civil é o de {{requerente.solteiro}} e que não convivo em união estável.`) + ciencia + fecho + data + assinatura('requerente') },
  dec_uniao_estavel: { nome: 'Declaração de Estado Civil (união estável)', corpo: titulo('DECLARAÇÃO DE ESTADO CIVIL') +
    p(`Nós, ${pessoa}, em união estável, devidamente {{requerente.inscrito}} no CPF sob o nº {{requerente.cpf}} e {{requerente.portador}} do RG nº ${rg}; e {{conjuge.tratamento}} {{conjuge.nome}}, {{conjuge.nacionalidade}}, devidamente {{conjuge.inscrito}} no CPF sob o nº {{conjuge.cpf}} e {{conjuge.portador}} do RG nº {{conjuge.rg}} {{conjuge.rgOrgao}}/{{conjuge.rgUf}}; residentes e {{casal.domiciliados}} à {{endereco.logradouro}}, {{endereco.numero}}, {{endereco.bairro}}, {{endereco.municipio}}/{{endereco.uf}}, com CEP {{endereco.cep}}, juridicamente capazes, declaramos que estamos em união estável, de natureza familiar, pública e duradoura, nos termos dos artigos 1.723 e seguintes do Código Civil Brasileiro, Título III – Da União Estável. Como convencionado têm, que o regime de bens adotado se equipara ao da comunhão parcial de bens.`) +
    p('Declaramos ainda estar cientes de que, se comprovada, a qualquer tempo, fraude ou falsidade, em prova ou declaração, estaremos {{casal.sujeitos}} a sanções cíveis, criminais e/ou administrativas, conforme dispõe o artigo 2º da Lei 7.115, de 29 de agosto de 1983, estando cientes das penalidades previstas no Código Penal Brasileiro, artigos 171 e 229.') +
    p('Assim sendo, por ser o aqui exposto a mais pura expressão da verdade, assinamos esta declaração para que produza efeitos legais.') + data + `<table style="width:100%;border:0"><tr><td style="width:50%;border:0;padding:0 12px">${assinatura('requerente')}</td><td style="width:50%;border:0;padding:0 12px">${assinatura('conjuge')}</td></tr></table>` },
  dec_sem_renda: { nome: 'Declaração de Inexistência de Rendimentos', corpo: titulo('DECLARAÇÃO DE INEXISTÊNCIA DE RENDIMENTOS') +
    p(`Eu, ${pessoa}, devidamente {{requerente.inscrito}} no CPF sob o nº {{requerente.cpf}} e {{requerente.portador}} do RG nº ${rg}, {{requerente.condicaoSemRenda}}, declaro para os devidos fins de comprovação de renda, sob pena de configuração de falsidade, que não exerço atividade com ou sem vínculo empregatício, sem qualquer percepção de remuneração.`) + ciencia + fecho + data + assinatura('requerente', false) },
  dec_renda: { nome: 'Declaração de Renda e Ocupação', corpo: titulo('DECLARAÇÃO DE RENDA E OCUPAÇÃO') +
    p(`Eu, ${pessoa}, {{requerente.estadoCivil}}, devidamente {{requerente.inscrito}} no CPF n° {{requerente.cpf}}, residente e {{requerente.domiciliado}} à {{endereco.logradouro}}, n° {{endereco.numero}}, {{endereco.bairro}}, {{endereco.municipio}}/{{endereco.uf}} com CEP {{endereco.cep}}, declaro para os devidos fins que não possuo comprovante de rendimentos ou outro documento que comprove minha renda mensal e atividade, e, ainda, declaro que não possuo vínculo empregatício no momento, sou {{requerente.ocupacaoDeclarada}}, recebendo o valor mensal variável de {{requerente.rendaMensal}}.`) + ciencia + fecho + p('{{endereco.municipio}}, {{documento.dataExtenso}}.') + assinatura('requerente') },
  dec_endereco: { nome: 'Declaração de Residência (terceiros)', corpo: titulo('DECLARAÇÃO DE RESIDÊNCIA') +
    p(`Eu, {{declarante.tratamento}} {{declarante.nome}}, {{declarante.nacionalidade}}, devidamente {{declarante.inscrito}} no CPF sob nº {{declarante.cpf}}, residente e {{declarante.domiciliado}} à {{declarante.logradouro}}, {{declarante.numero}}, {{declarante.bairro}}, na cidade de {{declarante.municipio}}/{{declarante.uf}}, {{declarante.cep}}, declaro para fins de comprovação de residência, que ${pessoa}, devidamente {{requerente.inscrito}} no CPF sob o nº {{requerente.cpf}} e {{requerente.portador}} do RG sob o nº ${rg}, é {{requerente.domiciliado}} em minha residência, localizada à {{declarante.logradouro}}, {{declarante.numero}}, {{declarante.bairro}}, na cidade de {{declarante.municipio}}/{{declarante.uf}}, {{declarante.cep}}.`) +
    p('Declaro ainda, sob as penas da lei, serem verdadeiras todas as informações acima prestadas sob pena de incorrer em ilícito civil e penal, nos termos do Art. 2º da Lei nº 7.115/83, bem como estar ciente que devo informar as autoridades competentes e a quem possa interessar em caso de mudança da situação acima descrita.') + p('{{declarante.municipio}}/{{declarante.uf}}, {{documento.data}}.') + assinatura('declarante', false) },
};
export const MODELO_PROTOCOLO = { nome: 'Requerimento para Protocolo', corpo: titulo('REQUERIMENTO PARA PROTOCOLO') +
  p('SENHOR(A) OFICIAL(A) DO REGISTRO DE IMÓVEIS DA COMARCA DE {{comarca.nome}} ESTADO DE {{comarca.estadoPorExtenso}}. A Prefeitura Municipal de {{municipio.nome}}, inscrita no CNPJ sob n° {{prefeitura.cnpj}}, com sede à {{prefeitura.endereco}}, neste ato representando o Município de {{municipio.nome}}/{{municipio.uf}}, vem, respeitosamente, perante Vossa Senhoria, requerer o REGISTRO DA CERTIDÃO DE REGULARIZAÇÃO FUNDIÁRIA – CRF, com fundamento no art. 28, inciso VII, e nos arts. 42 e seguintes da Lei Federal nº 13.465/2017, referente ao Núcleo Urbano Informal denominado {{nucleo.nome}}.') +
  p('Para instrução do presente requerimento, seguem anexados os seguintes documentos:') + `<ol style="list-style:decimal;padding-left:24px">${[
    'Certidão de Regularização Fundiária – CRF;',
    'Projeto de Regularização Fundiária aprovado pelo Município, contendo os documentos exigidos pelo art. 30 da Lei Federal nº 13.465/2017;',
    'Comprovantes das notificações realizadas aos confrontantes, titulares de domínio e terceiros interessados, acompanhados dos respectivos comprovantes de recebimento e publicações de editais, quando houver;',
    'Pareceres e manifestações dos órgãos municipais competentes;',
    'Demais documentos exigidos pela legislação aplicável ou pelo procedimento administrativo municipal.',
  ].map((t) => `<li>${t}</li>`).join('')}</ol>` +
  p('Diante do exposto, requer-se o processamento do presente pedido e o consequente registro da Certidão de Regularização Fundiária, bem como dos atos registrais dela decorrentes, nos termos da Lei Federal nº 13.465/2017 e demais normas pertinentes.') + p('Nestes termos, pede deferimento.') + p('{{municipio.nome}}, {{documento.dataExtenso}}') + '<div style="text-align:center;margin-top:40px;border-top:1px solid #333">{{prefeitura.prefeito.nome}}<br>{{prefeitura.prefeito.cargo}}<br>Representante Legal</div>' };

export const CAMPOS_DECLARANTE = [['nome','Nome completo'],['sexo','Sexo'],['nacionalidade','Nacionalidade'],['cpf','CPF'],['logradouro','Logradouro'],['numero','Número'],['complemento','Complemento'],['bairro','Bairro'],['municipio','Município de residência'],['uf','UF'],['cep','CEP']];
export const CAMPOS_PREFEITURA = [['prefeitura.cnpj','CNPJ da prefeitura'],['prefeitura.endereco','Endereço da sede'],['prefeitura.prefeito.nome','Nome do representante legal'],['prefeitura.prefeito.cargo','Cargo do representante legal'],['comarca.nome','Comarca do Registro de Imóveis'],['comarca.estadoPorExtenso','Estado da comarca por extenso']];
const normal = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const tem = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !/^_+$/.test(String(v));
export function pessoaDeclaracao(pessoa = {}) {
  const feminino = ['f','feminino'].includes(normal(pessoa.sexo));
  const masculino = ['m','masculino'].includes(normal(pessoa.sexo));
  const resultado = { ...pessoa };
  if (feminino || masculino) {
    resultado.tratamento = feminino ? 'Sra.' : 'Sr.';
    for (const palavra of ['inscrito','portador','domiciliado','solteiro','sujeito','desempregado']) resultado[palavra] = feminino ? (palavra === 'portador' ? 'portadora' : palavra.slice(0,-1)+'a') : palavra;
    resultado.nacionalidade = String(pessoa.nacionalidade || '').replace(/brasileir[oa](\(a\))?/gi, feminino ? 'brasileira' : 'brasileiro');
    resultado.estadoCivil = String(pessoa.estadoCivil || '').replace(/\b(solteir|casad|divorciad|separad|viúv)[oa](\(a\))?/gi, (_,base) => base + (feminino ? 'a' : 'o'));
  }
  return resultado;
}
export function datasDocumento(hoje = new Date()) {
  return { data: hoje.toLocaleDateString('pt-BR'), dataExtenso: hoje.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'}) };
}
export function entradasDeclaracao(p, tipo) {
  const anterior = [...(p.documentosGerados || [])].reverse().find((g) => g.tipo === tipo && g.entradas)?.entradas || {};
  return { ...anterior, declarante: { ...(anterior.declarante || {}) }, rendaMensal: anterior.rendaMensal ?? p.requerente?.renda ?? '' };
}
export function contextoDeclaracao(p, entradas = {}, hoje) {
  const requerente = pessoaDeclaracao({ ...p.requerente, estadoCivil: p.requerente?.estadoCivil || p.social?.estadoCivil });
  requerente.ocupacaoDeclarada = entradas.ocupacaoDeclarada;
  if (['ESTUDANTE','DO LAR'].includes(entradas.condicaoSemRenda)) requerente.condicaoSemRenda = entradas.condicaoSemRenda;
  else if (entradas.condicaoSemRenda === 'DESEMPREGADO(A)' && requerente.desempregado) requerente.condicaoSemRenda = requerente.desempregado.toUpperCase();
  const renda = entradas.rendaMensal;
  const numero = typeof renda === 'number' ? renda : Number(String(renda ?? '').replace(/R\$\s*/g,'').replace(/\.(?=\d{3}(?:[.,]|$))/g,'').replace(',','.'));
  if (tem(renda) && Number.isFinite(numero) && numero >= 0) requerente.rendaMensal = numero.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const conjuge = pessoaDeclaracao(p.conjuge);
  const casal = requerente.tratamento && conjuge.tratamento ? { domiciliados: requerente.tratamento === 'Sra.' && conjuge.tratamento === 'Sra.' ? 'domiciliadas' : 'domiciliados', sujeitos: requerente.tratamento === 'Sra.' && conjuge.tratamento === 'Sra.' ? 'sujeitas' : 'sujeitos' } : {};
  return { requerente, conjuge, casal, endereco: { ...p.endereco }, declarante: pessoaDeclaracao(entradas.declarante), documento: datasDocumento(hoje) };
}
export function gerarTextoDeclaracao(corpo, dados) {
  return expandirLacos(aplicarCondicionais(corpo, dados), dados);
}
export function impedimentoDeclaracao(tipo, p) {
  const estado = normal(p.requerente?.estadoCivil || p.social?.estadoCivil);
  if (tipo === 'dec_estado_civil' && !/^solteir[oa](\(a\))?$/.test(estado)) return 'Disponível somente para requerente solteiro ou solteira.';
  if (tipo === 'dec_uniao_estavel') {
    if (estado !== 'uniao estavel') return 'Disponível somente para requerente em união estável.';
    if (!tem(p.conjuge?.nome)) return 'Cadastre o cônjuge para emitir esta declaração.';
  }
  return '';
}
export function camposFaltantesDeclaracao(corpo, dados) {
  try { return lacunasDoDocumento(gerarTextoDeclaracao(corpo, dados)).marcadores; }
  catch (erro) { return [`modelo inválido: ${erro.message}`]; }
}

export function rotulosLacunas(campos) {
  const pessoas = { requerente: 'requerente', conjuge: 'cônjuge', declarante: 'declarante terceiro' };
  const rotulos = { tratamento: 'sexo', inscrito: 'sexo', portador: 'sexo', domiciliado: 'sexo', solteiro: 'sexo', sujeito: 'sexo', nome: 'nome', cpf: 'CPF', rg: 'RG', rgOrgao: 'órgão emissor do RG', rgUf: 'UF do RG', nacionalidade: 'nacionalidade', profissao: 'profissão', estadoCivil: 'estado civil', condicaoSemRenda: 'condição sem renda', ocupacaoDeclarada: 'ocupação declarada', rendaMensal: 'renda mensal', logradouro: 'logradouro', numero: 'número', bairro: 'bairro', municipio: 'município', uf: 'UF', cep: 'CEP' };
  return [...new Set(campos.map((c) => {
    const definido = CAMPOS_PREFEITURA.find(([chave]) => chave === c);
    if (definido) return definido[1];
    const [grupo, campo] = c.split('.');
    if (pessoas[grupo]) return `${rotulos[campo] || campo} do ${pessoas[grupo]}`;
    if (grupo === 'casal') return 'sexo dos dois companheiros';
    if (grupo === 'endereco') return `${rotulos[campo] || campo} de residência`;
    return c;
  }))];
}
