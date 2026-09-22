import { IMAGENS_INTEGRAL_2026 } from './timbrado-integral-2026.js';

export const MARGENS_PADRAO = { topo: 2, base: 2, lateral: 0 };

export function timbradoPadrao() {
  return {
    cabecalho: { modelo: 'integral-2026', nome: 'Integral 2026 — Cabeçalho', largura: 1414, altura: 190 },
    rodape: { modelo: 'integral-2026', nome: 'Integral 2026 — Rodapé', largura: 1414, altura: 110 },
    margens: { ...MARGENS_PADRAO },
    ativo: true,
  };
}

// Uma configuração existente, inclusive partes removidas, tem precedência.
export function configTimbrado(config) {
  if (config?.margens?.topo === 18 && config.margens.base === 16 && config.margens.lateral === 22) return { ...config, margens: { ...MARGENS_PADRAO } };
  return config ?? timbradoPadrao();
}

export function imagemPadrao(item, lugar) {
  return item?.modelo === 'integral-2026' && !item.chave ? IMAGENS_INTEGRAL_2026[lugar] || null : null;
}

export function versaoTimbrado(config) {
  return JSON.stringify(['cabecalho', 'rodape'].map((lugar) => {
    const item = config[lugar];
    return [item?.modelo, item?.chave, item?.enviadoEm];
  }));
}

export function aplicarTimbrado(html, timbrado) {
  if (!timbrado || timbrado.ativo === false) return html;
  const { imagens, margens } = timbrado;
  const m = { ...MARGENS_PADRAO, ...(margens || {}) };
  const cabecalho = imagens?.cabecalho ? `<div style="text-align:center;margin:0 0 ${m.topo}mm"><img src="${imagens.cabecalho}" style="width:100%;max-width:100%" alt="" /></div>` : '';
  const rodape = imagens?.rodape ? `<div style="text-align:center;margin:${m.base}mm 0 0"><img src="${imagens.rodape}" style="width:100%;max-width:100%" alt="" /></div>` : '';
  if (!cabecalho && !rodape) return html;
  return `<div style="padding:0 ${m.lateral}mm">${cabecalho}${html}${rodape}</div>`;
}
