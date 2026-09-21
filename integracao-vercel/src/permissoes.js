export const SETORES = {
  diretoria: { nome: "Diretoria", descricao: "Acesso total, como administrador" },
  comercial: { nome: "Comercial", descricao: "Mobilização, contrato e análise documental" },
  topografia: { nome: "Topografia", descricao: "Topografia, levantamento de campo e memorial" },
  projeto: { nome: "Projeto", descricao: "Projeto de REURB e PRF" },
  posprotocolo: { nome: "Pós-protocolo", descricao: "Prefeitura, CRF e matrícula" },
  juridico: { nome: "Jurídico", descricao: "Análise jurídica, contratos e devolutivas" },
  financeiro: { nome: "Financeiro", descricao: "Clientes, planos de trabalho, calendário, chat e gestão financeira" },
  consulta: { nome: "Consulta", descricao: "Só visualiza" },
};
export const FUNCOES = ["Diretor", "Coordenador", "Analista", "Técnico", "Advogado", "Assistente", "Estagiário"];
export const SETOR_DA_ETAPA = { mobilizacao: "comercial", contrato: "comercial", documental: "comercial", topografia: "topografia", projeto: "projeto", prefeitura: "posprotocolo", crf: "posprotocolo" };
export function permissoes(u) {
  const s = u?.setor || "consulta";
  const dir = s === "diretoria";
  return {
    setor: s, diretor: dir, nome: SETORES[s]?.nome || "Consulta",
    financeiro: !!u && u.ativo !== false && (dir || s === "financeiro"),
    planos: dir || s === "comercial" || s === "financeiro",
    verCPF: s === "financeiro" || dir || s === "comercial" || s === "projeto",
    cadastro: s === "financeiro" || dir || s === "comercial",
    social: dir || s === "comercial",
    imovel: dir || s === "comercial" || s === "topografia",
    validarDocs: dir || s === "comercial",
    juridico: dir || s === "juridico",
    forcarValidacao: dir,
    situacao: dir || s === "comercial",
    estrutura: dir || s === "comercial",
    criterio: dir || s === "comercial",
    nucleos: dir,
    campo: dir || s === "topografia",
    campoOffline: !!u,
    prf: dir || s === "projeto",
    modeloPRF: dir || s === "projeto",
    config: dir, importar: dir, usuarios: dir,
    etapa: (etapaId) => dir || SETOR_DA_ETAPA[etapaId] === s,
    secao: (setorSecao) => dir || setorSecao === s,
  };
}

// O cadastro canônico do ERP pode identificar Financeiro pelo tipo ou pelo setor.
export function setorDoPerfilERP(perfil, mapa) {
  const original = mapa[perfil.tipo] || 'consulta';
  if (original === 'diretoria') return original;
  return [perfil.tipo, perfil.setor].some(v => String(v || '').trim().toLowerCase() === 'financeiro') ? 'financeiro' : original;
}
