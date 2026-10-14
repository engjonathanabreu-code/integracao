// Display cache loaded exclusively from the authenticated contract RPC.
// Drafts, names, local sectors and imported HTML never become effective grants.
const contratos = new Map();
export function registrarContrato(id, contrato) {
  if (!id) return;
  contratos.set(id, contrato && !Array.isArray(contrato) && typeof contrato === 'object' ? structuredClone(contrato) : {regras:{}});
}
export function limparContratos() { contratos.clear(); }
export function contratoDoUsuario(usuario) { return contratos.get(usuario?.erpRef || usuario?.id); }
export function acaoPermitida(usuario,recurso,acao,herdado = true) {
  if (!usuario || usuario.ativo === false) return false;
  const contrato = contratoDoUsuario(usuario);
  if (contrato?.revisao_compativel === false) return false;
  const valor = contrato?.regras?.[recurso]?.[acao];
  return typeof valor === 'boolean' ? valor : !!herdado;
}
