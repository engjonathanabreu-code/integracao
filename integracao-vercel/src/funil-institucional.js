export const CARTEIRAS_INSTITUCIONAIS = [
  {id:'reserva', nome:'Reserva', descricao:'Núcleos qualificados aguardando capacidade.'},
  {id:'preparacao', nome:'Preparação', descricao:'Construção institucional e pré-mobilização.'},
  {id:'venda', nome:'Venda', descricao:'Núcleos lançados, com produção de contratos.'},
];
const chaveCidade = (nome, uf) => `${String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}|${String(uf || '').trim().toUpperCase()}`;
export const funilVazio = () => ({versao:1, cidades:[], nucleos:[], historico:[]});
export function alterarFunil(base, acao, {autor, data = new Date().toISOString()}) {
  const novo = structuredClone(base || funilVazio());
  if (!autor) throw new Error('Responsável ausente.');
  if (acao.tipo === 'cidade') {
    const anterior = novo.cidades.find(c => c.id === acao.id);
    for (const campo of ['municipioId','institucionalId']) if (acao[campo] !== undefined && acao[campo] !== (anterior?.[campo] ?? null)) throw new Error('O fluxo é independente. Preserve as referências anteriores; não crie novos vínculos externos.');
    const nome = String(acao.nome || '').trim(), uf = String(acao.uf || '').trim().toUpperCase();
    if (nome.length < 2 || !/^[A-Z]{2}$/.test(uf)) throw new Error('Informe município e UF.');
    if (novo.cidades.some(c => c.id !== acao.id && chaveCidade(c.nome,c.uf) === chaveCidade(nome,uf))) throw new Error('A cidade já está no fluxo.');
    const etapa = acao.etapa || anterior?.etapa || 'nuvens';
    if (!['nuvens','prospeccao','carteiras'].includes(etapa)) throw new Error('Etapa inválida.');
    if (etapa === 'prospeccao' && novo.cidades.filter(c => c.id !== acao.id && c.etapa === 'prospeccao').length >= 4) throw new Error('Prospecção já acompanha quatro municípios. Conclua ou devolva um deles às Nuvens antes de incluir outro.');
    const cidade = {...anterior,id:acao.id, nome, uf, etapa};
    novo.cidades = [...novo.cidades.filter(c => c.id !== cidade.id), cidade];
  } else if (acao.tipo === 'nucleo') {
    if (!CARTEIRAS_INSTITUCIONAIS.some(c => c.id === acao.carteira)) throw new Error('Selecione uma etapa válida.');
    const anterior = novo.nucleos.find(n => n.nucleoId === acao.nucleoId);
    if (anterior) {
      // Alterar a etapa mantém todos os identificadores e vínculos anteriores.
      anterior.carteira = acao.carteira;
    } else {
      const cidade = novo.cidades.find(c => c.id === acao.cidadeId);
      if (!cidade || !['prospeccao','carteiras'].includes(cidade.etapa)) throw new Error('O município do fluxo precisa passar pela Prospecção.');
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
