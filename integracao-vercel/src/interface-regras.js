// Regras puras de interação das telas (onda 1 do pente fino de Interface).
// Nada aqui lê ou grava dados: só decide o que a tela mostra ou pergunta.

/* ---------- Formulário de meta: erro junto do campo ---------- */
// Cada mensagem de validação do formulário de meta pertence a um campo da tela.
export const CAMPO_DO_ERRO_META = {
  "Informe o título da meta": "titulo",
  "Selecione ao menos um responsável": "responsaveis",
  "Selecione o item que será associado à meta": "associacao",
  "Cadastre a devolutiva em Metas > Devolutivas e selecione o registro acima": "registroDev",
  "O núcleo deve ser o mesmo da devolutiva vinculada": "associacao",
  "A devolutiva precisa de Município e Núcleo válidos": "associacao",
  "Uma devolutiva precisa estar ligada a um processo": "associacao",
  "Informe a data de chegada da devolutiva": "chegadaDev",
  "Informe o prazo final para responder": "prazoDev",
  "O prazo não pode ser antes da chegada": "prazoDev",
  "Envie o arquivo da devolutiva": "arquivosDev",
};

// Devolve { campo: "mensagem. mensagem." } apenas para os campos em que a pessoa
// já tocou, ou para todos depois de tentar salvar. Mensagem sem campo conhecido
// vai para "geral" e só aparece depois da tentativa de salvar.
export function errosVisiveisMeta(erros, tocados = {}, tentouSalvar = false) {
  const porCampo = {};
  for (const mensagem of erros || []) {
    const campo = CAMPO_DO_ERRO_META[mensagem] || "geral";
    if (!tentouSalvar && (campo === "geral" || !tocados[campo])) continue;
    (porCampo[campo] = porCampo[campo] || []).push(mensagem);
  }
  return Object.fromEntries(Object.entries(porCampo).map(([campo, lista]) => [campo, `${lista.join(". ")}.`]));
}

/* ---------- Remoções nas metas: pergunta antes de apagar ---------- */
// Texto da confirmação (no formato do ModalConfirmar) para remover item do
// checklist, anexo ou setor de metas. O nome vem da própria tela.
export function confirmacaoRemocaoMeta(tipo, nome) {
  const alvo = String(nome || "").trim();
  if (tipo === "checklist") return { titulo: "Remover este item do checklist?", texto: `"${alvo || "Item sem título"}" sairá do checklist da meta. A remoção fica registrada no histórico.`, rotuloBotao: "Remover item" };
  if (tipo === "anexo") return { titulo: "Remover este arquivo da meta?", texto: `"${alvo || "Arquivo"}" deixará de aparecer nos arquivos da meta. A remoção fica registrada no histórico.`, rotuloBotao: "Remover arquivo" };
  if (tipo === "setor") return { titulo: "Excluir este setor?", texto: `O setor "${alvo || "sem nome"}" deixará de aparecer nas metas e nos filtros.`, rotuloBotao: "Excluir setor" };
  throw new Error(`Tipo de remoção desconhecido: ${tipo}`);
}

/* ---------- Ficha do cliente: descartar alterações ---------- */
// Confirmação (formato do ModalConfirmar) antes de desfazer a edição da ficha.
export function confirmacaoDescarteCadastro(quantidade) {
  const n = Math.max(0, Number(quantidade) || 0);
  const perda = n === 1 ? "1 alteração não salva será perdida" : n > 1 ? `${n} alterações não salvas serão perdidas` : "As alterações não salvas serão perdidas";
  return { titulo: "Descartar as alterações da ficha?", texto: `${perda}. A ficha volta ao que estava salvo.`, rotuloBotao: n === 1 ? "Descartar 1 alteração" : n > 1 ? `Descartar ${n} alterações` : "Descartar alterações" };
}

/* ---------- Ficha do cliente: erros ao salvar ---------- */
const OBRIGATORIO_VAZIO = /^(CPF|CNPJ) do requerente, que é obrigatório/;
export const MENSAGEM_CAMPO_FALTANDO = "Preencha este campo: ele é obrigatório a partir da etapa Contrato.";
// Recebe a lista do que o Salvar recusou e devolve o aviso que fica na barra de
// salvar e os campos obrigatórios vazios a destacar. Campos preenchidos com
// valor inválido já ficam vermelhos por conta própria.
export function avisoErrosCadastro(invalidos) {
  const lista = (invalidos || []).filter(Boolean);
  if (!lista.length) return { mensagem: "", faltando: [] };
  const faltando = lista.map((item) => OBRIGATORIO_VAZIO.exec(item)).filter(Boolean).map((m) => (m[1] === "CNPJ" ? "requerente.cnpj" : "requerente.cpf"));
  return { mensagem: `Corrija antes de salvar: ${lista.join(", ")}.`, faltando };
}
// Mensagem do campo obrigatório que o Salvar apontou e que continua vazio.
export function campoFaltando(form, path, valor) {
  return !valor && (form?.faltando || []).includes(path) ? MENSAGEM_CAMPO_FALTANDO : "";
}
// Leva a tela até o primeiro campo marcado com erro e põe o cursor nele.
export function irAoPrimeiroErro(raiz) {
  const campo = raiz?.querySelector?.(".contem .inp.erro:not(:disabled)") || raiz?.querySelector?.(".contem .inp.erro");
  if (!campo) return false;
  campo.scrollIntoView?.({ block: "center" });
  campo.focus?.();
  return true;
}

/* ---------- Botão apagado: dizer o motivo ---------- */
// Texto curto para ficar ao lado de um botão desabilitado por pendências.
export function motivosBotaoBloqueado(erros, prefixo = "Para continuar") {
  const lista = [...new Set((erros || []).map((e) => String(e || "").trim().replace(/[.;]+$/, "")).filter(Boolean))];
  return lista.length ? `${prefixo}: ${lista.join("; ")}.` : "";
}

/* ---------- Análise simulada de documentos: só na demonstração ---------- */
// A simulação preenche a ficha com valores de exemplo; fora do ambiente de
// demonstração ela não pode ser oferecida nem executada.
export function podeSimularAnalise(demo) {
  return demo === true;
}
// Chamado antes de analisar um documento: recusa o pedido de simulação e o
// preenchimento de exemplo por falta de arquivo quando o ambiente é o real.
export function exigirAnaliseReal({ demo, simular, temArquivo }) {
  if (podeSimularAnalise(demo)) return;
  if (simular) throw new Error("A simulação só existe no ambiente de demonstração.");
  if (!temArquivo) throw new Error("O arquivo não está mais disponível. Remova da lista e envie de novo.");
}
