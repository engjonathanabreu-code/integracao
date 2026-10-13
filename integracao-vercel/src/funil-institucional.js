export const CARTEIRAS_INSTITUCIONAIS = [
  {id:'reserva', nome:'Reserva', descricao:'Núcleos qualificados aguardando capacidade.'},
  {id:'preparacao', nome:'Preparação', descricao:'Construção institucional e pré-mobilização dos próximos lançamentos.'},
  {id:'venda', nome:'Venda', descricao:'Núcleos lançados, com produção de contratos.'},
];
const chaveCidade = (nome, uf) => `${String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}|${String(uf || '').trim().toUpperCase()}`;
export const funilVazio = () => ({versao:1, cidades:[], nucleos:[], historico:[]});
export function alterarFunil(base, acao, {municipios, nucleos, autor, data = new Date().toISOString()}) {
  const novo = structuredClone(base || funilVazio());
  if (!autor) throw new Error('Responsável ausente.');
  if (acao.tipo === 'cidade') {
    const municipio = acao.municipioId ? municipios.find(m => m.id === acao.municipioId) : null;
    if (acao.municipioId && !municipio) throw new Error('Município não encontrado.');
    const nome = (municipio?.nome || acao.nome || '').trim(), uf = (municipio?.uf || acao.uf || '').trim().toUpperCase();
    if (nome.length < 2 || !/^[A-Z]{2}$/.test(uf)) throw new Error('Informe cidade e UF.');
    if (novo.cidades.some(c => c.id !== acao.id && chaveCidade(c.nome,c.uf) === chaveCidade(nome,uf))) throw new Error('A cidade já está no fluxo.');
    const anterior = novo.cidades.find(c => c.id === acao.id);
    if (anterior?.municipioId && anterior.municipioId !== municipio?.id && novo.nucleos.some(n => n.municipioId === anterior.municipioId)) throw new Error('A cidade já possui núcleos no fluxo. Preserve o vínculo municipal.');
    const etapa = acao.etapa || anterior?.etapa || 'nuvens';
    if (!['nuvens','prospeccao','carteiras'].includes(etapa)) throw new Error('Etapa inválida.');
    if (etapa !== 'nuvens' && !municipio) throw new Error('Vincule o município cadastrado antes de avançar.');
    if (etapa === 'prospeccao' && novo.cidades.filter(c => c.id !== acao.id && c.etapa === 'prospeccao').length >= 4) throw new Error('Prospecção já acompanha quatro municípios. Conclua ou devolva um deles às Nuvens antes de incluir outro.');
    const cidade = {id:acao.id, nome, uf, municipioId:municipio?.id || null, etapa};
    novo.cidades = [...novo.cidades.filter(c => c.id !== cidade.id), cidade];
  } else if (acao.tipo === 'nucleo') {
    const nucleo = nucleos.find(n => n.id === acao.nucleoId);
    if (!nucleo || !CARTEIRAS_INSTITUCIONAIS.some(c => c.id === acao.carteira)) throw new Error('Selecione núcleo e carteira válidos.');
    const cidade = novo.cidades.find(c => c.municipioId === nucleo.municipioId);
    if (!cidade || cidade.etapa === 'nuvens') throw new Error('O município do núcleo precisa passar pela Prospecção.');
    novo.nucleos = [...novo.nucleos.filter(n => n.nucleoId !== nucleo.id), {nucleoId:nucleo.id, municipioId:nucleo.municipioId, carteira:acao.carteira}];
    // A passagem ocorre por vínculo explícito, sem criar ou converter cadastros.
    cidade.etapa = 'carteiras';
  } else throw new Error('Ação inválida.');
  novo.historico.push({id:acao.eventoId, data, autor, acao:structuredClone(acao)});
  return novo;
}
