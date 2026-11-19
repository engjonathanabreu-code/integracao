import {responsavelMeta} from './metas-identidade.js';
import {metaOperacional} from './planejamento-metas.js';
import {permissoes} from './permissoes.js';

export function diaTrabalho(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
}
const texto = valor => String(valor || '').replace(/[\r\n\t]+/g, ' ').trim();
const prazoValido = valor => /^\d{4}-\d{2}-\d{2}$/.test(valor || '') && Number.isFinite(Date.parse(valor)) && new Date(valor).toISOString().slice(0,10) === valor;

// Somente a carteira já carregada e explicitamente atribuída ao usuário.
// Não é autorização de servidor e não consulta nem persiste nenhum dado.
export function filaTrabalhoPessoal(metas = [], usuario, hoje = diaTrabalho()) {
  if (!usuario?.id || usuario.ativo === false) return [];
  return metas.filter(m => metaOperacional(m) && responsavelMeta(m,usuario) && !['Concluído','Cancelado','Cancelada'].includes(m.status)).map(m => {
    const prazo = prazoValido(m.prazo) ? m.prazo : '';
    const aguardando = m.status === 'Aguardando aprovação';
    const itens = (m.checklist || []).filter(c => !c.concluido);
    const categoria = aguardando ? 'Aguardando aprovação' : !prazo ? 'Conferir prazo' : prazo < hoje ? 'Vencida' : prazo === hoje ? 'Vence hoje' : 'Próxima';
    const proximoPasso = aguardando ? 'Acompanhar a aprovação; não refazer a entrega.' : itens.length ? texto(itens[0].titulo) || 'Conferir item pendente do checklist.' : 'Conferir a entrega e atualizar a meta no fluxo oficial.';
    return {id:m.id,titulo:texto(m.titulo) || 'Meta sem título',status:texto(m.status),prazo,categoria,proximoPasso,pendentes:itens.length};
  }).sort((a,b) => ['Vencida','Vence hoje','Conferir prazo','Próxima','Aguardando aprovação'].indexOf(a.categoria) - ['Vencida','Vence hoje','Conferir prazo','Próxima','Aguardando aprovação'].indexOf(b.categoria) || a.prazo.localeCompare(b.prazo) || a.titulo.localeCompare(b.titulo,'pt-BR') || String(a.id).localeCompare(String(b.id)));
}
export function resumoTrabalhoPessoal(fila, hoje = diaTrabalho()) {
  return [`PLANO PESSOAL PARA REVISÃO · ${hoje}`, 'Base: metas atribuídas presentes nesta sessão. Pode haver alterações ainda não sincronizadas.', 'Rascunho local: não enviado, não salvo e não conclui nenhuma tarefa.', '', ...(fila.length ? fila.map((m,i) => `${i+1}. ${m.titulo}\nSituação: ${m.categoria} | Prazo: ${m.prazo || 'não informado ou inválido'} | Itens pendentes: ${m.pendentes}\nPróximo passo: ${m.proximoPasso}`) : ['Nenhuma meta aberta atribuída nesta sessão. Isso não confirma ausência de pendências no servidor.'])].join('\n');
}
export function atalhoTrabalhoPessoal(usuario) {
  if (!usuario?.id || usuario.ativo === false) return null;
  const perm = permissoes(usuario);
  return usuario.setor === 'topografia' && perm.campoOffline && perm.campo ? {rotulo:'Abrir campo offline',rota:{pag:'campoOffline',aba:'topografia'}} : null;
}
