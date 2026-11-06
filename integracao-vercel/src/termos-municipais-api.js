import { requisicao } from './dados-compartilhados.js';

export function criarApiTermosMunicipais(enviar = requisicao) {
  const operar = (acao, dados) => enviar('rpc/integracao_termos_operar', { method: 'POST', body: JSON.stringify({ p_acao: acao, p_dados: dados }) });
  return {
    listarModelos: municipioId => operar('listar_modelos', { municipioId }),
    salvarModelo: dados => operar('salvar_modelo', dados),
    listarEmissoes: processoId => operar('listar_emissoes', { processoId }),
    preparar: dados => operar('preparar', dados),
    emitir: dados => operar('emitir', dados),
  };
}
export const apiTermosMunicipais = criarApiTermosMunicipais();
