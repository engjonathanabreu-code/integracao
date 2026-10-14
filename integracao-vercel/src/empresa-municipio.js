export function empresaDoMunicipio(db, municipioId) {
  return db.ajustesMunicipio?.[municipioId]?.empresaDocumento?.dados || db.empresa || {};
}
export function timbradoDoMunicipio(db, municipioId) {
  const config = db.ajustesMunicipio?.[municipioId];
  const codigo = config?.empresaDocumento?.codigo || 'integral';
  return config?.timbradosEmpresa?.[codigo] ?? (codigo === 'integral' ? db.timbrado : {ativo:false,cabecalho:null,rodape:null});
}
export function prepararEmpresaMunicipal(codigo, dados, ajustes, cnpjValido) {
  if (!['integral','mcl'].includes(codigo)) throw new Error('Empresa inválida.');
  if (codigo === 'integral') return {codigo, dados:{...dados}};
  if (!dados.razaoSocial?.trim() || !cnpjValido(dados.cnpj) || !dados.endereco?.trim()) throw new Error('Confirme razão social, CNPJ válido e endereço da Minha Casa Legal.');
  if (!ajustes?.timbradosEmpresa?.mcl?.cabecalho?.chave) throw new Error('Envie o timbrado oficial da Minha Casa Legal antes de selecioná-la.');
  return {codigo, dados:{razaoSocial:dados.razaoSocial.trim(),cnpj:dados.cnpj,endereco:dados.endereco.trim()}};
}
