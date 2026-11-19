import {filaTrabalhoPessoal, diaTrabalho} from './trabalho-pessoal.js';

const orientacoes = {
  comercial: 'Conferir os documentos e retornos necessários à entrega. Para metas de vendas, usar o medidor oficial; não estimar vendas nem atribuí-las por nomes ou conversas.',
  topografia: 'Conferir levantamento, identificação da unidade e arquivos necessários à entrega. Verificar a sincronização do campo antes de usar os dados.',
  projeto: 'Conferir as peças de projeto e os insumos necessários à entrega, conforme o checklist e as regras vigentes do município.',
  posprotocolo: 'Conferir o protocolo e a última atualização registrada. Distinguir pendência da equipe de espera pela Prefeitura ou pelo Registro de Imóveis; não inventar previsão.',
  juridico: 'Conferir os documentos e fundamentos necessários à revisão. Sinalizar dúvidas para análise do profissional responsável, sem apresentar conclusão jurídica automática.',
  financeiro: 'Conferir os documentos e a conciliação necessários à entrega. Usar valores e confirmações oficiais, sem presumir pagamento, aprovação ou baixa.',
  consulta: 'Conferir as informações disponíveis e apontar dúvidas ao responsável. Este preparo não concede permissão para editar ou aprovar registros.',
};
const texto = valor => String(valor || '').replace(/[\r\n\t]+/g, ' ').trim();

// A seleção nunca autoriza leitura adicional. Só usa uma meta aberta já
// carregada e atribuída ao próprio usuário, pelas mesmas regras da fila.
export function preparoEntregaPessoal(metas, usuario, id, hoje = diaTrabalho()) {
  const meta = metas.find(m => m.id === id && filaTrabalhoPessoal([m], usuario, hoje).length);
  if (!meta) return null;
  const [item] = filaTrabalhoPessoal([meta], usuario, hoje);
  const aprovacao = item.categoria === 'Aguardando aprovação';
  const pendentes = (meta.checklist || []).filter(c => !c.concluido);
  return [
    `PREPARO DE ENTREGA PARA REVISÃO · ${hoje}`,
    'Base: meta atribuída nos dados desta sessão. Confira a sincronização e o registro oficial antes de agir.',
    'Rascunho local: não enviado, não salvo e não executa nem conclui tarefas.',
    '',
    `Meta: ${item.titulo}`,
    `Situação registrada: ${item.status || 'não informada'}`,
    `Prazo registrado: ${item.prazo || 'não informado ou inválido'}`,
    `Próximo passo: ${item.proximoPasso}`,
    '',
    aprovacao ? 'ENTREGA AGUARDANDO APROVAÇÃO' : 'CHECKLIST PENDENTE REGISTRADO',
    ...(aprovacao ? ['Acompanhar a decisão no fluxo oficial. Não refazer a entrega nem tratar a aprovação como concluída.']
      : pendentes.length ? pendentes.map((c,i) => `${i+1}. ${texto(c.titulo) || 'Item sem título: conferir na meta.'}`)
      : ['Nenhum item pendente registrado. Isso não comprova que a entrega esteja completa.']),
    '',
    'PONTOS PARA CONFERIR (SUGESTÕES, NÃO EXIGÊNCIAS CADASTRADAS)',
    aprovacao ? 'Se houver pedido de correção, conferir o motivo registrado antes de planejar nova execução.'
      : orientacoes[usuario.setor] || 'Conferir os insumos e critérios de entrega no fluxo oficial, respeitando as atribuições atuais.',
    'Confirmar o que já foi entregue e o que falta comprovar. Evidências e anexos não foram examinados neste preparo.',
  ].join('\n');
}
