export const INFRA_PRF = [['redeEnergia','Rede de energia'],['iluminacao','Iluminação pública'],['redeAgua','Rede de água'],['drenagem','Drenagem a executar'],['drenagemExistente','Drenagem existente'],['passeio','Passeios'],['pavimentacao','Pavimentação']];
export const CRONOGRAMA_PRF = [['redeEnergia','Rede de energia'],['ligacaoEnergia','Ligações de energia'],['redeAgua','Rede de água'],['ligacaoAgua','Ligações de água'],['esgoto','Esgotamento sanitário'],['drenagem','Drenagem'],['risco','Medidas de risco'],['ambiental','Medidas ambientais']];
export const TIPOS_AREA_PRF = [['via','Via / rua','logradouro'],['app','APP','areaApp'],['risco','Área de risco','areaRisco'],['publica','Área pública','areaPublica'],['servidao','Servidão','servidao']];

export function numeroExtenso(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1000000000) return '';
  const unidades = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','catorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const dezenas = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const centenas = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  if (n < 20) return unidades[n];
  if (n < 100) return dezenas[Math.floor(n/10)] + (n%10 ? ' e '+numeroExtenso(n%10) : '');
  if (n === 100) return 'cem';
  if (n < 1000) return centenas[Math.floor(n/100)] + (n%100 ? ' e '+numeroExtenso(n%100) : '');
  const base = n < 1000000 ? 1000 : 1000000, q = Math.floor(n/base), r = n%base;
  return (base === 1000 ? (q === 1 ? 'mil' : numeroExtenso(q)+' mil') : numeroExtenso(q)+(q === 1 ? ' milhão' : ' milhões')) + (r ? (r < 100 || r%100 === 0 ? ' e ' : ' ')+numeroExtenso(r) : '');
}

export function medidasPRF(area) {
  const saida = {};
  for (const campo of ['area','perimetro']) {
    const v = typeof area?.[campo] === 'number' ? area[campo] : Number(String(area?.[campo] ?? '').replace(/\./g,'').replace(',','.'));
    if (area?.[campo] == null || area?.[campo] === '' || !Number.isFinite(v) || v < 0) continue;
    const centesimos = Math.round(v*100), inteiro = Math.floor(centesimos/100), fracao = centesimos%100;
    saida[campo] = (centesimos/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    saida[campo+'MetrosExtenso'] = numeroExtenso(inteiro);
    saida[campo+(campo === 'area' ? 'DecimetrosExtenso' : 'CentimetrosExtenso')] = numeroExtenso(fracao);
  }
  return saida;
}
export function complementoNucleoPRF(n) {
  const estrutura = { infra: {}, cronograma: {} };
  const marcadores = {};
  const adicionar = (prefixo,obj) => { for(const [k,v] of Object.entries(obj)) marcadores[prefixo+'.'+k]=v; };
  adicionar('nucleo',medidasPRF(n.memorial));
  for (const [id] of INFRA_PRF) {
    const dado = n.infra?.[id] || {};
    estrutura.infra[id] = {...dado};
    adicionar('infra.'+id, { vias:dado.vias || '', via1:dado.via1 || '', via2:dado.via2 || '', descricao:dado.descricao || '' });
  }
  for(const [id] of CRONOGRAMA_PRF) {
    const valor=n.cronograma?.[id];
    estrutura.cronograma[id]=valor;
    estrutura.cronograma[id+'Prazo']=valor === false ? '' : n.cronograma?.[id+'Prazo'];
    marcadores['cronograma.'+id]=valor === true ? 'Sim' : valor === false ? 'Não' : '';
    marcadores['cronograma.'+id+'Prazo']=estrutura.cronograma[id+'Prazo'] || '';
  }
  for (const [tipo,,prefixo] of TIPOS_AREA_PRF) {
    const itens=(n.memorial?.vias || []).filter(v=>(v.tipo || 'via')===tipo).map(v=>({...v,...medidasPRF(v)}));
    if(itens.length)estrutura[prefixo+'s']=itens;
    // Marcador singular só representa uma área; múltiplas áreas devem usar laço.
    if(itens.length===1) {estrutura[prefixo]=itens[0];adicionar(prefixo,itens[0]);}
  }
  return {estrutura,marcadores};
}
export function removerCronogramaNao(html,n) {
  const negativos=CRONOGRAMA_PRF.filter(([id])=>n.cronograma?.[id]===false).map(([id])=>id);
  if(!negativos.length)return html;
  const doc=new DOMParser().parseFromString(html,'text/html');
  for(const el of [...doc.querySelectorAll('tr,p,li')]) {
    if(!el.isConnected)continue;
    const chaves=[...el.textContent.matchAll(/\{\{\s*cronograma\.([\w]+)\s*\}\}/g)].map(m=>m[1].replace(/Prazo$/,''));
    if(chaves.length && chaves.every(k=>negativos.includes(k))) (el.closest('tr') || el).remove();
  }
  return doc.body.innerHTML;
}
