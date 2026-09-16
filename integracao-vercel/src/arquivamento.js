export const COLECOES_ARQUIVO = ['municipios', 'remessas', 'nucleos', 'processos'];
export const arquivoDoRegistro = registro => registro?.extras?.arquivamento;
export const arquivadoDiretamente = registro => arquivoDoRegistro(registro)?.ativo === true;
export const podeArquivar = usuario => usuario?.ativo !== false && usuario?.setor === 'diretoria';

export function mapaArquivamento(db) {
  const municipios = new Set((db.municipios || []).filter(arquivadoDiretamente).map(r => r.id));
  const remessas = new Set((db.remessas || []).filter(r => arquivadoDiretamente(r) || municipios.has(r.municipioId)).map(r => r.id));
  const nucleos = new Set((db.nucleos || []).filter(r => arquivadoDiretamente(r) || municipios.has(r.municipioId) || remessas.has(r.remessaId)).map(r => r.id));
  const processos = new Set((db.processos || []).filter(r => arquivadoDiretamente(r) || municipios.has(r.municipioId) || remessas.has(r.remessaId) || nucleos.has(r.nucleoId)).map(r => r.id));
  return { municipios, remessas, nucleos, processos };
}

export function dadosVisiveis(db) {
  if (!db) return db;
  const mapa = mapaArquivamento(db);
  const visiveis = { ...db };
  for (const colecao of COLECOES_ARQUIVO) visiveis[colecao] = (db[colecao] || []).filter(r => !mapa[colecao].has(r.id));
  // Base apenas para numeração/validação: arquivar não libera códigos antigos.
  Object.defineProperty(visiveis, '_baseArquivo', { value: db, enumerable: false });
  return visiveis;
}

export function vinculadosAoRegistro(db, colecao, id) {
  const selecionados = { municipios: new Set(), remessas: new Set(), nucleos: new Set(), processos: new Set() };
  selecionados[colecao].add(id);
  for (const r of db.remessas || []) if (selecionados.municipios.has(r.municipioId)) selecionados.remessas.add(r.id);
  for (const r of db.nucleos || []) if (selecionados.municipios.has(r.municipioId) || selecionados.remessas.has(r.remessaId)) selecionados.nucleos.add(r.id);
  for (const r of db.processos || []) if (selecionados.municipios.has(r.municipioId) || selecionados.remessas.has(r.remessaId) || selecionados.nucleos.has(r.nucleoId)) selecionados.processos.add(r.id);
  selecionados[colecao].delete(id);
  return selecionados;
}

export function alterarArquivamento(db, colecao, id, arquivar, usuario, data = new Date().toISOString()) {
  if (!podeArquivar(usuario)) throw new Error('Somente a Diretoria pode arquivar ou restaurar.');
  if (!COLECOES_ARQUIVO.includes(colecao)) throw new Error('Cadastro inválido.');
  const registro = db[colecao]?.find(r => r.id === id);
  if (!registro || registro._resumo) throw new Error('Abra o município e carregue o cadastro antes de arquivar ou restaurar.');
  if (!arquivar) {
    const mapa = mapaArquivamento(db);
    if (mapa.municipios.has(registro.municipioId) || mapa.remessas.has(registro.remessaId) || mapa.nucleos.has(registro.nucleoId)) throw new Error('Restaure primeiro o município, a remessa ou o núcleo arquivado.');
  }
  const anterior = arquivoDoRegistro(registro) || {};
  registro.extras = { ...registro.extras, arquivamento: { ...anterior, ativo: arquivar,
    ...(arquivar ? { arquivadoEm: data, arquivadoPor: usuario.nome, arquivadoPorId: usuario.id, etapa: registro.etapa, etapaProcesso: registro.etapaProcesso }
      : { restauradoEm: data, restauradoPor: usuario.nome, restauradoPorId: usuario.id }) } };
  return db;
}

// Pacotes locais são preservados para não perder alterações ainda não enviadas.
export function pacotesVisiveis(pacotes, mapa, comercial = false) {
  return Object.fromEntries(Object.entries(pacotes || {}).filter(([id]) => !mapa[comercial ? 'remessas' : 'nucleos'].has(id)).map(([id, pacote]) => [id, {
    ...pacote, ...(comercial ? { clientes:(pacote.clientes || []).filter(p => !mapa.processos.has(p.id)) } : { unidades:(pacote.unidades || []).filter(p => !mapa.processos.has(p.id)) })
  }]));
}
