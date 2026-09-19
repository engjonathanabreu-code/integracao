export const ETAPAS_PROCESSO = ['Comercial', 'Coleta Documental', 'Análise Documental', 'Topografia', 'Projetos', 'Protocolo', 'Andamento', 'Concluído'];
export const etapaProcessoPadrao = n => ETAPAS_PROCESSO[[2, 3, 4, 5, 6][Math.min(n.etapa, 4)]] || 'Comercial';
export const etapaProcesso = n => n.etapaProcesso || etapaProcessoPadrao(n);
export const referenciaNucleo = n => n.externo?.kanbanId || n.id;
export function etapaDoAndamento(nucleos, id) {
  const n = nucleos.find(n => referenciaNucleo(n) === id);
  return n ? etapaProcesso(n) : '';
}
