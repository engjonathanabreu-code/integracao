// Teste de plausibilidade do que a IA leu em documentos de cliente, antes de virar sugestão aplicável.
// Funções puras; os dígitos verificadores usam os mesmos validadores do cadastro.
import { cpfValido, cnpjValido } from './requisitos-moradores.js';

export const ANO_MINIMO_DATA_DOCUMENTO = 1900;
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// '' quando a data é plausível; caso contrário, o motivo em português.
export function problemaData(valor, hoje = hojeLocal()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? ''));
  if (!m) return 'Data em formato inválido.';
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < ANO_MINIMO_DATA_DOCUMENTO) return `Data impossível: anterior a ${ANO_MINIMO_DATA_DOCUMENTO}.`;
  const real = new Date(Date.UTC(ano, mes - 1, dia));
  if (mes < 1 || mes > 12 || dia < 1 || real.getUTCFullYear() !== ano || real.getUTCMonth() !== mes - 1 || real.getUTCDate() !== dia) return 'Data impossível: esse dia não existe no calendário.';
  if (String(valor) > hoje) return 'Data no futuro.';
  return '';
}

// Confere um valor sugerido pelo caminho do campo no cadastro (ex.: "requerente.cpf", "conjuge.nascimento").
export function problemaSugestao(path, valor, hoje) {
  const campo = String(path ?? '').split('.').pop();
  if (campo === 'cpf') return cpfValido(valor) ? '' : 'CPF inválido: os dígitos verificadores não conferem.';
  if (campo === 'cnpj') return cnpjValido(valor) ? '' : 'CNPJ inválido: os dígitos verificadores não conferem.';
  if (campo === 'nascimento' || campo === 'dataUniao') return problemaData(valor, hoje);
  return '';
}

// Acrescenta "implausivel" (motivo) às linhas reprovadas; as demais ficam como vieram.
export function marcarPlausibilidade(linhas, hoje) {
  return (linhas || []).map(l => { const implausivel = problemaSugestao(l.path, l.sugerido, hoje); return implausivel ? { ...l, implausivel } : l; });
}

// Seleção campo a campo: sugestão implausível nunca vem marcada nem pode ser aplicada.
export function selecaoInicialSugestoes(linhas, permitido = () => true) {
  return Object.fromEntries((linhas || []).map(l => [l.path, !l.diverge && !l.implausivel && !!permitido(l)]));
}
export function sugestoesSelecionadas(linhas, selecao) {
  return (linhas || []).filter(l => !!selecao?.[l.path] && !l.implausivel);
}
