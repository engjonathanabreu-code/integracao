// Datas civis ISO: comparar strings evita deslocamento por fuso horário.
export const ocorreNoDia = (item, dia) => item.tipo === 'meta'
  ? dia >= (item.inicio || item.dia) && dia <= (item.fim || item.dia)
  : item.dia === dia;

export function segmentosMetas(itens, dias) {
  return itens.filter(i => i.tipo === 'meta').flatMap(item => {
    const indices = dias.map((dia, i) => ocorreNoDia(item, dia) ? i : -1).filter(i => i >= 0);
    if (!indices.length) return [];
    return [{ item, coluna: indices[0] + 1, largura: indices.at(-1) - indices[0] + 1 }];
  });
}

// O filtro de metas preserva reuniões e etapas dos planos.
export function filtrarMetasCalendario(itens, filtro) {
  return itens.filter(item => item.tipo !== 'meta' || !filtro || (filtro === 'atrasadas' ? item.atrasada : !item.atrasada));
}
