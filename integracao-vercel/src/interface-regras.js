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
