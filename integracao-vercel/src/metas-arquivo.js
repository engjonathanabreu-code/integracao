// EDI-M1: metas deixam de ser excluídas e passam a ser arquivadas com motivo,
// no mesmo padrão do arquivo de Clientes (marca no próprio registro, restaurável).
// A marca é um campo do Integração na meta; a gravação segue pela fila como uma edição comum.
export const MOTIVO_MINIMO_ARQUIVO_META = 10;
export const arquivoDaMeta = meta => meta?.arquivamento;
export const metaArquivada = meta => arquivoDaMeta(meta)?.ativo === true;
export const metasAtivas = metas => (metas || []).filter(m => !metaArquivada(m));
export const metasArquivadas = metas => (metas || []).filter(metaArquivada)
  .sort((a, b) => String(arquivoDaMeta(b).arquivadoEm || '').localeCompare(String(arquivoDaMeta(a).arquivadoEm || '')));
export const podeArquivarMeta = usuario => !!usuario && usuario.ativo !== false && usuario.setor === 'diretoria';

function localizar(db, id, usuario) {
  if (!podeArquivarMeta(usuario)) throw new Error('Somente a Diretoria pode arquivar ou restaurar metas.');
  const meta = (db.metas || []).find(m => m.id === id);
  if (!meta) throw new Error('Meta não encontrada. Atualize a página e tente novamente.');
  return meta;
}

export function arquivarMeta(db, id, motivo, usuario, data = new Date().toISOString()) {
  const meta = localizar(db, id, usuario), texto = String(motivo || '').trim();
  if (texto.length < MOTIVO_MINIMO_ARQUIVO_META) throw new Error(`Informe o motivo do arquivamento (mínimo de ${MOTIVO_MINIMO_ARQUIVO_META} caracteres).`);
  if (metaArquivada(meta)) return db;
  meta.arquivamento = { ...arquivoDaMeta(meta), ativo: true, motivo: texto, arquivadoEm: data, arquivadoPor: usuario.nome, arquivadoPorId: usuario.id, status: meta.status };
  return db;
}

export function restaurarMeta(db, id, usuario, data = new Date().toISOString()) {
  const meta = localizar(db, id, usuario);
  if (!metaArquivada(meta)) return db;
  meta.arquivamento = { ...arquivoDaMeta(meta), ativo: false, restauradoEm: data, restauradoPor: usuario.nome, restauradoPorId: usuario.id };
  return db;
}

// Resumo para a lista do arquivo: o conteúdo da meta continua inteiro no registro.
export function resumoMetaArquivada(meta) {
  const a = arquivoDaMeta(meta) || {};
  return { id: meta.id, titulo: meta.titulo || '', setor: meta.setor || '', status: meta.status || '', motivo: a.motivo || '', arquivadoPor: a.arquivadoPor || '', arquivadoEm: a.arquivadoEm || '',
    checklist: (meta.checklist || []).length, comentarios: (meta.comentarios || []).length, arquivos: (meta.arquivos || []).length, historico: (meta.historico || []).length };
}
