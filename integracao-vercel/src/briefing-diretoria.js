// Pauta local: somente dados já autorizados do panorama, sem chamadas ou escrita.
const texto = (v, padrao = 'Não informado') => typeof v === 'string' && v.trim() ? v.slice(0, 1000).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 240) : padrao;
const numero = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const lista = v => Array.isArray(v) ? v.slice(0, 100) : [];
const dia = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;

export function prepararPauta(dados = {}) {
  const p = dados.painel || {}, m = p.metas || {}, c = dados.comercial || {};
  const itens = [];
  const adicionar = (prioridade, titulo, evidencia, responsavel, acao, fonte, atraso = 0) => itens.push({ prioridade, titulo, evidencia, responsavel: texto(responsavel), acao, fonte, atraso });
  for (const meta of lista(m.pendencias)) {
    if (!meta || typeof meta.status !== 'string' || !meta.status.trim() || ['Concluído', 'Cancelado'].includes(meta.status)) continue;
    const prazo = dia(meta.prazo), hoje = dia(p.hoje), atraso = numero(meta.dias_atraso);
    const aprovacao = meta.status === 'Aguardando aprovação';
    const proxima = prazo && hoje && prazo >= hoje && Date.parse(prazo) - Date.parse(hoje) <= 7 * 86400000;
    if (!aprovacao && !(atraso > 0) && !proxima) continue;
    adicionar(aprovacao ? 1 : atraso > 0 ? 2 : 4, texto(meta.titulo, 'Meta sem título'),
      `${texto(meta.status)}; setor: ${texto(meta.setor)}; prazo registrado: ${prazo || 'não informado'}${atraso > 0 ? `; ${atraso} dias de atraso` : ''}.`, meta.responsaveis,
      aprovacao ? 'Revisar a entrega e decidir sobre a aprovação no fluxo existente. Não aprovar sem conferir.' : atraso > 0 ? 'Confirmar o impedimento e combinar recuperação da meta existente, sem criar duplicata.' : 'Confirmar capacidade de entrega e o próximo passo antes do prazo.',
      'Panorama do setor · Metas · Pendências', atraso || 0);
  }
  for (const nucleo of lista(p.nucleos?.parados)) {
    if (!nucleo || !(numero(nucleo.dias_na_etapa) > 0)) continue;
    adicionar(3, `${texto(nucleo.nucleo)} · ${texto(nucleo.municipio)}`, `${nucleo.dias_na_etapa} dias na etapa ${texto(nucleo.etapa)}. Isso não comprova inatividade.`, nucleo.responsavel,
      'Conferir o último andamento e a pendência antes de decidir quem pode destravar a etapa.', 'Panorama do setor · Núcleos parados', nucleo.dias_na_etapa);
  }
  for (const retorno of lista(c.followup?.atrasados_lista)) {
    if (!retorno) continue;
    adicionar(2, `Retorno: ${texto(retorno.lead)}`, `Follow-up listado como atrasado; previsto: ${texto(retorno.previsto)}; etapa: ${texto(retorno.etapa)}.`, retorno.responsavel,
      'Conferir se o retorno ainda está pendente e combinar o contato no CRM. Nenhuma mensagem será enviada.', 'Panorama comercial · Follow-ups atrasados', numero(retorno.dias) || 0);
  }
  // Não mesclar registros homônimos: as consultas atuais não retornam seus IDs.
  itens.sort((a, b) => a.prioridade - b.prioridade || b.atraso - a.atraso || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const cobertura = [
    `Metas abertas: ${numero(m.abertas) ?? 'não informado'}; vencidas: ${numero(m.vencidas) ?? 'não informado'}; aguardando aprovação: ${numero(m.aguardando_aprovacao) ?? 'não informado'}.`,
    `Registros recebidos: ${Array.isArray(m.pendencias) ? m.pendencias.length : 'não informado'} metas; ${Array.isArray(p.nucleos?.parados) ? p.nucleos.parados.length : 'não informado'} núcleos parados.`,
    'Pauta parcial: as consultas limitam as listas; esta pauta avalia no máximo 100 registros de cada lista e exibe até 10 itens. Ausência de item não comprova ausência de pendência. Homônimos devem ser conferidos no cadastro.',
    'Ordem sugerida por regra: aprovação, atraso, tempo prolongado na etapa, prazo próximo. Não é avaliação de desempenho de pessoas.',
    'A leitura indica quando os dados foram consultados, não quando cada registro foi atualizado. Confirme o estado antes de agir.',
  ];
  return { setor: texto(dados.setor), leitura: texto(dados.gerado_em), referencia: dia(p.hoje) || 'não informada', itens: itens.slice(0, 10), totalCandidatos: itens.length, cobertura };
}

export function textoPauta(pauta) {
  return [`PAUTA DE GESTÃO · ${pauta.setor}`, `Leitura: ${pauta.leitura} · Data-base: ${pauta.referencia}`,
    'Preparação local, sem IA adicional. Nenhuma alteração ou comunicação executada.',
    ...pauta.cobertura,
    ...(pauta.itens.length ? pauta.itens.map((item, i) => `${i + 1}. ${item.titulo}\nEvidência: ${item.evidencia}\nResponsável registrado: ${item.responsavel}\nPróximo passo sugerido: ${item.acao}\nFonte: ${item.fonte}\nDecisão da reunião: ______ · Responsável acordado: ______ · Prazo acordado: ______`) : ['Nenhum item elegível nos registros recebidos. Verifique a cobertura antes de concluir que está tudo em dia.']),
    `Exibidos ${pauta.itens.length} de ${pauta.totalCandidatos} candidatos avaliados nas listas recebidas.`].join('\n\n');
}
