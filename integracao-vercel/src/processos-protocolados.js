import {etapaProcesso} from './processo-etapas.js';

export const ETAPAS_PREFEITURA = ['Parecer Social', 'Notificações', 'Parecer setor Planejamento', 'Parecer setor Meio Ambiente', 'Parecer setor Defesa Civil', 'Despacho de Saneamento', 'CRF'];
export const etapaPrefeitura = n => ETAPAS_PREFEITURA.includes(n.etapaPrefeitura) ? n.etapaPrefeitura : '';
export function processoProtocolado(n) {
  if (n.ativo === false || n.extras?.arquivamento?.ativo) return false;
  return !!etapaPrefeitura(n) || ['Protocolo', 'Andamento', 'Concluído'].includes(etapaProcesso(n))
    || (n.andamentos || []).some(a => ['Protocolado', ...ETAPAS_PREFEITURA].includes(a.status));
}
export function moverProcessoPrefeitura(n, destino, {id, por, data}) {
  if (!ETAPAS_PREFEITURA.includes(destino)) throw new Error('Etapa de prefeitura inválida.');
  const anterior = etapaPrefeitura(n);
  if (anterior === destino) return;
  n.etapaPrefeitura = destino;
  n.etapaPrefeituraIniciadaEm = data;
  n.historicoEtapas = [{id, de: anterior || 'Etapa a definir', para: destino, por, data,
    fluxo: 'prefeitura', observacao: 'Movimentação em Processos Protocolados'}, ...(n.historicoEtapas || [])];
}
