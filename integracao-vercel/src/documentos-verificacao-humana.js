import {docBloqueado, ativo} from './requisitos-moradores.js';

// A verificação humana usa a mesma autorização da validação documental existente.
// Não produz resultados de IA nem altera campos cadastrais.
export function registrarVerificacaoHumana({processo, tipo, justificativa, usuario, perm, id, data = new Date().toISOString()}) {
  if (!perm?.validarDocs || !ativo(processo)) throw new Error('Sem autorização para verificar documentos.');
  if (!usuario?.nome || !id || !tipo) throw new Error('Identifique o responsável e o documento.');
  const motivo = String(justificativa || '').trim();
  if (motivo.length < 5) throw new Error('Registre o documento conferido e a justificativa.');
  const anterior = [...(processo.docs || [])].reverse().find(doc => doc.tipo === tipo);
  if (docBloqueado(anterior) && !perm.forcarValidacao) throw new Error('Uma regra obrigatória não foi atendida. A exceção exige a autorização já prevista para a Diretoria.');
  return {id, tipo, status: 'validado', data, por: usuario.nome, validadoPor: usuario.nome,
    validadoEm: data, origem: 'verificação humana', analiseIA: false, justificativa: motivo,
    documentoAnteriorId: anterior?.id || null, regras: [], arquivoDescartado: false};
}
