export const CARTEIRAS_INSTITUCIONAIS = [
  {id:'reserva', nome:'Reserva', descricao:'Núcleos qualificados aguardando capacidade.'},
  {id:'preparacao', nome:'Preparação', descricao:'Construção institucional e pré-mobilização.'},
  {id:'venda', nome:'Venda', descricao:'Núcleos lançados, com produção de contratos.'},
];
const chaveCidade = (nome, uf) => `${String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}|${String(uf || '').trim().toUpperCase()}`;
export const funilVazio = () => ({versao:1, cidades:[], nucleos:[], historico:[]});
export function alterarFunil(base, acao, {institucionais = [], autor, data = new Date().toISOString()}) {
  const novo = structuredClone(base || funilVazio());
  if (!autor) throw new Error('Responsável ausente.');
  if (acao.tipo === 'cidade') {
    const anterior = novo.cidades.find(c => c.id === acao.id);
    const institucionalId = acao.institucionalId || null;
    if (institucionalId && !institucionais.some(c => c.id === institucionalId)) throw new Error('Cliente institucional não encontrado. Atualize a lista antes de vincular.');
    const nome = String(acao.nome || '').trim(), uf = String(acao.uf || '').trim().toUpperCase();
    if (nome.length < 2 || !/^[A-Z]{2}$/.test(uf)) throw new Error('Informe município e UF.');
    if (novo.cidades.some(c => c.id !== acao.id && chaveCidade(c.nome,c.uf) === chaveCidade(nome,uf))) throw new Error('A cidade já está no fluxo.');
    if (institucionalId && novo.cidades.some(c => c.id !== acao.id && c.institucionalId === institucionalId)) throw new Error('O cliente institucional já está vinculado a outro município do fluxo.');
    if (anterior?.institucionalId !== institucionalId && novo.nucleos.some(n => n.cidadeId === acao.id)) throw new Error('O município já possui núcleos. Preserve o vínculo institucional.');
    if (acao.municipioId && acao.municipioId !== anterior?.municipioId) throw new Error('Novos vínculos devem usar Clientes institucionais.');
    const etapa = acao.etapa || anterior?.etapa || 'nuvens';
    if (!['nuvens','prospeccao','carteiras'].includes(etapa)) throw new Error('Etapa inválida.');
    if (etapa !== 'nuvens' && !institucionalId && !(anterior?.municipioId && anterior.etapa !== 'nuvens')) throw new Error('Vincule um cliente institucional antes de avançar.');
    if (etapa === 'prospeccao' && novo.cidades.filter(c => c.id !== acao.id && c.etapa === 'prospeccao').length >= 4) throw new Error('Prospecção já acompanha quatro municípios. Conclua ou devolva um deles às Nuvens antes de incluir outro.');
    const cidade = {...anterior,id:acao.id, nome, uf, institucionalId, etapa};
    novo.cidades = [...novo.cidades.filter(c => c.id !== cidade.id), cidade];
  } else if (acao.tipo === 'nucleo') {
    if (!CARTEIRAS_INSTITUCIONAIS.some(c => c.id === acao.carteira)) throw new Error('Selecione uma etapa válida.');
    const anterior = novo.nucleos.find(n => n.nucleoId === acao.nucleoId);
    if (anterior) {
      // Alterar a etapa mantém todos os identificadores e vínculos anteriores.
      anterior.carteira = acao.carteira;
    } else {
      const cidade = novo.cidades.find(c => c.id === acao.cidadeId);
      if (!cidade?.institucionalId || cidade.etapa === 'nuvens') throw new Error('O município vinculado a Clientes institucionais precisa passar pela Prospecção.');
      const nome = String(acao.nome || '').trim();
      if (nome.length < 2 || nome.length > 120) throw new Error('Informe o nome do núcleo institucional.');
      if (novo.nucleos.some(n => n.cidadeId === cidade.id && chaveCidade(n.nome,'') === chaveCidade(nome,''))) throw new Error('Este núcleo já está no município.');
      novo.nucleos.push({nucleoId:acao.nucleoId,cidadeId:cidade.id,nome,carteira:acao.carteira});
      cidade.etapa = 'carteiras';
    }
  } else throw new Error('Ação inválida.');
  novo.historico.push({id:acao.eventoId, data, autor, acao:structuredClone(acao)});
  return novo;
}
