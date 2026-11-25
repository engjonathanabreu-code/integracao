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
