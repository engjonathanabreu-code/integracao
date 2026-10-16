import {docBloqueado, ativo} from './requisitos-moradores.js';

// A verificação humana usa a mesma autorização da validação documental existente.
// Não produz resultados de IA nem altera campos cadastrais.
export function registrarVerificacaoHumana({processo, tipo, justificativa, usuario, perm, id, data = new Date().toISOString()}) {
  if (!perm?.validarDocs || !ativo(processo)) throw new Error('Sem autorização para verificar documentos.');
  if (!usuario?.nome || !id || !tipo) throw new Error('Identifique o responsável e o documento.');
  const motivo = String(justificativa || '').trim();
  if (motivo.length < 5) throw new Error('Registre o documento conferido e a justificativa.');
  const anterior = documentoMaisRecente(processo.docs, tipo);
  if (docBloqueado(anterior) && !perm.forcarValidacao) {
    const motivos=anterior.regras.filter(r=>r.gravidade==='bloqueia'&&r.resultado==='nao_atende').map(r=>[r.nome,r.observacao].filter(Boolean).join(': ')).join('; ');
    throw new Error(`Conferência pendente: ${motivos || 'regra obrigatória não atendida'}. Corrija o cadastro ou envie o documento atualizado. A Diretoria pode avaliar uma exceção com justificativa.`);
  }
  return {id, tipo, status: 'validado', data, por: usuario.nome, validadoPor: usuario.nome,
    validadoEm: data, origem: 'verificação humana', analiseIA: false, justificativa: motivo,
    documentoAnteriorId: anterior?.id || null, regras: [], arquivoDescartado: false};
}

export function documentoMaisRecente(docs,tipo){return (docs||[]).map((doc,i)=>({doc,i})).filter(({doc})=>doc.tipo===tipo&&(!doc.pessoaId||doc.pessoaId===(tipo==='identidade_conjuge'?'conjuge':'requerente'))).sort((a,b)=>(Date.parse(b.doc.validadoEm||b.doc.data)||0)-(Date.parse(a.doc.validadoEm||a.doc.data)||0)||b.i-a.i)[0]?.doc;}
