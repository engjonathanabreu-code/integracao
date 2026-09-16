import { useState } from 'react';
import { ordenarLinhas } from './ordenacao.js';
export function useOrdenacao(inicial) {
  const [ordem, setOrdem] = useState({coluna:inicial,direcao:'asc'});
  const cabecalho = (coluna, texto) => <th key={coluna} aria-sort={ordem.coluna === coluna ? ordem.direcao === 'asc' ? 'ascending' : 'descending' : 'none'}>
    <button type="button" onClick={() => setOrdem(v=>({coluna,direcao:v.coluna === coluna && v.direcao === 'asc' ? 'desc' : 'asc'}))} style={{font:'inherit',color:'inherit',background:'none',border:0,padding:0,textAlign:'left',cursor:'pointer'}}>{texto} <span aria-hidden="true">{ordem.coluna === coluna ? ordem.direcao === 'asc' ? '↑' : '↓' : '↕'}</span></button>
  </th>;
  return {cabecalho, ordenar:(lista, seletores)=>ordenarLinhas(lista,seletores[ordem.coluna],ordem.direcao)};
}
