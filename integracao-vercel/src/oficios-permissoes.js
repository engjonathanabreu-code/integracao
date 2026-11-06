const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
// A geração não concede registro de envio, gestão de versões ou modelos.
export const podeGerarOficios = usuario => !!usuario && usuario.ativo === true;
export function podeEditarOficios(usuario) {
 if (!usuario || usuario.ativo === false) return false;
 const tipo = normalizar(usuario.tipoERP || usuario.tipo), setor = normalizar(usuario.setorERP || usuario.setor);
 return ['administrador','diretor tecnico','diretor de projetos'].includes(tipo) || tipo.startsWith('diretor ') || ['projeto','projetos','juridico'].includes(tipo) || ['projeto','projetos','juridico'].includes(setor) || (!tipo && setor === 'diretoria');
}
