// Contrato compartilhável com o servidor. Modelos municipais são texto e
// marcadores explícitos: nenhum HTML, expressão ou script é interpretado.
export const CAMPOS_TERMO = Object.freeze({
  'requerente.nome': 'Nome ou razão social do requerente',
  'requerente.documento': 'CPF ou CNPJ do requerente',
  'requerente.rg': 'RG do requerente',
  'requerente.estadoCivil': 'Estado civil do requerente',
  'requerente.profissao': 'Profissão do requerente',
  'requerente.nacionalidade': 'Nacionalidade do requerente',
  'conjuge.nome': 'Nome do cônjuge beneficiário, quando aplicável',
  'conjuge.documento': 'CPF do cônjuge beneficiário, quando aplicável',
  qualificacao: 'Qualificação completa para o compromisso',
  codigo: 'Código do morador',
  'unidade.codigo': 'Código da unidade selecionada',
  'unidade.area': 'Área da unidade selecionada',
  'unidade.loteQuadra': 'Lote e quadra da unidade selecionada',
  'nucleo.nome': 'Nome do núcleo',
  'nucleo.codigo': 'Código do núcleo',
  'municipio.nome': 'Nome do município',
  'municipio.uf': 'UF do município',
  modalidade: 'Modalidade cadastrada',
  endereco: 'Endereço cadastrado do requerente',
  data: 'Data de emissão',
  observacao: 'Observação de compromisso cadastrada',
});

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;
export const MAX_TEXTO_TERMO = 100000;
const perfilNormalizado = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function podeGerarTermosMunicipais(usuario) {
  if (!usuario || usuario.ativo === false) return false;
  const tipo = perfilNormalizado(usuario.tipoERP || usuario.tipo), setor = perfilNormalizado(usuario.setorERP || usuario.setor);
  const autorizados = ['projeto', 'projetos', 'comercial', 'atendimentos', 'topografia', 'juridico', 'pos-protocolo', 'posprotocolo'];
  return tipo === 'administrador' || tipo.startsWith('diretor ') || autorizados.includes(tipo) || autorizados.includes(setor);
}
export const escaparTextoTermo = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function htmlTermoMunicipal(texto, titulo = 'Termo de compromisso') {
  return `<h1 style="text-align:center">${escaparTextoTermo(titulo)}</h1>` + String(texto || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => `<p style="text-align:justify">${escaparTextoTermo(p).replace(/\n/g, '<br>')}</p>`).join('');
}

export function validarModeloTermo(modelo) {
  const erros = [];
  if (!String(modelo?.municipioId || '').trim()) erros.push('Selecione o município do modelo.');
  if (!String(modelo?.titulo || '').trim() || String(modelo.titulo).length > 160) erros.push('Informe um título de até 160 caracteres.');
  if (!String(modelo?.variante || '').trim() || String(modelo.variante).length > 100) erros.push('Informe uma variante de até 100 caracteres.');
  const corpo = String(modelo?.corpo || '');
  if (!corpo.trim() || corpo.length > MAX_TEXTO_TERMO) erros.push('Informe o texto do modelo, com no máximo 100 mil caracteres.');
  const campos = [...new Set([...corpo.matchAll(TOKEN)].map(m => m[1].trim()))];
  const desconhecidos = campos.filter(c => !Object.hasOwn(CAMPOS_TERMO, c));
  if (desconhecidos.length) erros.push(`Marcadores não reconhecidos: ${desconhecidos.join(', ')}.`);
  if (/\{\{|\}\}/.test(corpo.replace(TOKEN, ''))) erros.push('Há um marcador incompleto no texto. Use {{campo}}.');
  const obrigatorios = modelo?.obrigatorios;
  if (!Array.isArray(obrigatorios) || obrigatorios.some(c => !Object.hasOwn(CAMPOS_TERMO, c) || !campos.includes(c))) erros.push('Os campos obrigatórios precisam ser marcadores presentes no modelo.');
  return { erros, campos };
}

export function preencherTermoMunicipal(modelo, dados) {
  const validacao = validarModeloTermo(modelo);
  if (validacao.erros.length) throw new Error(validacao.erros.join(' '));
  const faltas = [...new Set(modelo.obrigatorios.filter(c => {
    const valor = Object.hasOwn(dados || {}, c) ? dados[c] : null;
    return valor === null || valor === undefined || !String(valor).trim() || (c === 'qualificacao' && /\[[^\]]+\]|_{4,}/.test(String(valor)));
  }))];
  const texto = modelo.corpo.replace(TOKEN, (_, chave) => {
    const c = chave.trim();
    const v = Object.hasOwn(dados || {}, c) ? dados[c] : '';
    if (v != null && typeof v !== 'string' && typeof v !== 'number') throw new Error(`O campo ${CAMPOS_TERMO[c]} não pôde ser preenchido.`);
    return v == null ? '' : String(v);
  });
  return { titulo: modelo.titulo, texto, html: htmlTermoMunicipal(texto, modelo.titulo), faltas, campos: validacao.campos };
}

export function modelosDoMunicipio(modelos, municipioId) {
  return (modelos || []).filter(m => m.municipioId === municipioId && m.ativo !== false);
}

export function validarContextoTermo({ modelo, processo, unidade, municipio, nucleo }) {
  if (!modelo || !processo || !municipio || modelo.municipioId !== municipio.id || processo.municipioId !== municipio.id) throw new Error('O modelo e o cadastro precisam pertencer ao mesmo município.');
  if (!unidade?.id || !(processo.unidades || []).some(u => u.id === unidade.id)) throw new Error('Selecione uma unidade vinculada a este morador.');
  if (!nucleo || nucleo.id !== processo.nucleoId || nucleo.municipioId !== municipio.id) throw new Error('O núcleo não corresponde ao cadastro selecionado.');
  return true;
}
