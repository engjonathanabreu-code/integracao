import { requisicao } from './dados-compartilhados.js';
import { validarObservacao } from './observacoes-documentos.js';

export function criarApiObservacoesDocumentos(transportar = requisicao) {
  const operar = async (acao, processoId, dados) => {
    if (!processoId) throw Error('Morador não identificado.');
    const resposta = await transportar('rpc/integracao_documentos_observacoes_operar', { method: 'POST', body: JSON.stringify({ p_acao: acao, p_processo_id: String(processoId), p_dados: dados }) });
    const valor = Array.isArray(resposta) && resposta.length === 1 ? resposta[0] : resposta;
    if (!valor || typeof valor !== 'object') throw Error('O servidor não confirmou a operação. Seu texto foi mantido.');
    return valor;
  };
  const confirmar = (row, id) => { if (row.id !== id || !Number.isInteger(row.versao) || row.versao < 1) throw Error('O servidor não confirmou a gravação. Seu texto foi mantido.'); return row; };
  return {
    async listar(processoId, { inicio = 0, limite = 20, excluidas = false } = {}) {
      const data = await operar('listar', processoId, { inicio, limite, excluidas });
      if (!Array.isArray(data.itens) || !Number.isInteger(data.total)) throw Error('Não foi possível carregar as observações.');
      return data;
    },
    async salvar(processoId, { id, versao, conteudo }) {
      return confirmar(await operar('salvar', processoId, { id, versao, conteudo: validarObservacao(conteudo) }), id);
    },
    async excluir(processoId, { id, versao }) { return confirmar(await operar('excluir', processoId, { id, versao }), id); },
    async restaurar(processoId, { id, versao }) { return confirmar(await operar('restaurar', processoId, { id, versao }), id); }
  };
}
export const observacoesDocumentosApi = criarApiObservacoesDocumentos();
