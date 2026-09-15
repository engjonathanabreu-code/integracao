// Importa o pacote gerado a partir do banco do Integrado (sistema anterior) para o Supabase compartilhado,
// pela mesma RPC integracao_gravar usada nas edições normais. Idempotente: registros que já existem são pulados,
// então dá para repetir a importação quantas vezes for preciso.
import { requisicao, gravarOperacoes } from './dados-compartilhados.js';

const CHAVES = { fin_receb_municipios: ['id'], fin_receb_remessas: ['id'], fin_receb_clientes: ['id'], processos_kanban: ['id'], processos_kanban_observacoes: ['id'] };
const chaveDe = (tabela) => CHAVES[tabela] || ['colecao', 'registro_id'];

async function chavesExistentes(tabela) {
  const campos = chaveDe(tabela);
  const todas = new Set();
  for (let offset = 0; ; offset += 1000) {
    const pagina = await requisicao(`${tabela}?select=${campos.join(',')}&order=${campos.join(',')}&limit=1000&offset=${offset}`);
    pagina.forEach((r) => todas.add(campos.map((c) => r[c]).join('|')));
    if (pagina.length < 1000) return todas;
  }
}

export function validarPacote(pacote) {
  if (!pacote || pacote.formato !== 'integracao-importacao-integrado' || !Array.isArray(pacote.fases)) throw new Error('Este arquivo não é um pacote de importação do Integrado.');
  const total = pacote.fases.reduce((s, f) => s + (f.linhas || []).length, 0);
  return { total, fases: pacote.fases.map((f) => ({ nome: f.nome, tabela: f.tabela, linhas: (f.linhas || []).length })), gerado: pacote.gerado, origem: pacote.origem };
}

// onProgresso({fase, feitos, total, pulados, gravados, mensagem})
export async function importarIntegrado(pacote, { actor, onProgresso = () => {}, tamanhoLote = 120, parar = () => false } = {}) {
  validarPacote(pacote);
  const quem = actor?.erpRef;
  if (!quem) throw new Error('Entre com a sua conta do ERP para importar.');
  const resumo = { gravados: 0, pulados: 0, erros: [], porFase: {} };
  for (const fase of pacote.fases) {
    const chave = chaveDe(fase.tabela);
    onProgresso({ fase: fase.nome, feitos: 0, total: fase.linhas.length, mensagem: `Conferindo o que já existe em ${fase.tabela}…` });
    const existentes = await chavesExistentes(fase.tabela);
    const ops = [];
    for (const linha of fase.linhas) {
      if (linha._atualizar) { // alteração pontual (ex.: prefixo do município), só quando o valor atual ainda é o esperado
        ops.push({ table: fase.tabela, key: Object.fromEntries(chave.map((c) => [c, linha[c]])), expected: linha._esperado || {}, changes: linha._atualizar });
        continue;
      }
      const k = chave.map((c) => linha[c]).join('|');
      if (existentes.has(k)) { resumo.pulados += 1; continue; }
      const changes = { ...linha };
      chave.forEach((c) => delete changes[c]);
      if ('criado_por' in changes) changes.criado_por = quem; // RLS exige que o autor seja quem está importando
      ops.push({ table: fase.tabela, key: Object.fromEntries(chave.map((c) => [c, linha[c]])), insert: true, changes });
    }
    let feitos = fase.linhas.length - ops.length;
    resumo.porFase[fase.nome] = { total: fase.linhas.length, pulados: feitos, gravados: 0 };
    for (let i = 0; i < ops.length; i += tamanhoLote) {
      if (parar()) { resumo.interrompido = true; return resumo; }
      const lote = ops.slice(i, i + tamanhoLote);
      onProgresso({ fase: fase.nome, feitos, total: fase.linhas.length, gravados: resumo.gravados, pulados: resumo.pulados, mensagem: `Gravando ${fase.nome}: ${feitos} de ${fase.linhas.length}` });
      try {
        await gravarOperacoes(lote, crypto.randomUUID());
        resumo.gravados += lote.length; resumo.porFase[fase.nome].gravados += lote.length;
      } catch (e) {
        // Um lote com erro não derruba a importação: o erro fica registrado e o restante segue. Rodar de novo tenta só o que faltou.
        resumo.erros.push({ fase: fase.nome, de: i, ate: i + lote.length, mensagem: e.message, exemplo: lote[0]?.key });
        if (resumo.erros.length > 25) throw new Error(`Muitos erros seguidos em ${fase.nome}: ${e.message}`);
      }
      feitos += lote.length;
    }
    onProgresso({ fase: fase.nome, feitos, total: fase.linhas.length, gravados: resumo.gravados, pulados: resumo.pulados, mensagem: `${fase.nome}: concluída` });
  }
  return resumo;
}
