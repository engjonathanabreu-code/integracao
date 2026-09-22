// Base gráfica comum ao Word, PDF e prévia. A NBR 14724 é acadêmica;
// contratos e declarações usam seus parâmetros gráficos, sem capa acadêmica.
export const PAGINA = { largura: 210, altura: 297, topo: 30, esquerda: 30, direita: 20, base: 20 };
export const FONTE_DOCUMENTO = 'Times New Roman';
export const mmTwip = mm => Math.round(mm * 1440 / 25.4);
const mmPt = mm => mm * 72 / 25.4;
export const escaparDocumento = texto => String(texto ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function lerImagem(src) {
  if (!/^data:image\/(png|jpeg|jpg);base64,/i.test(src || '')) throw new Error('Uma imagem não está incorporada. Reenvie-a em PNG ou JPG.');
  const tipo = /^data:image\/png/i.test(src) ? 'png' : 'jpg';
  const data = Uint8Array.from(atob(src.split(',')[1]), c => c.charCodeAt(0));
  let largura, altura;
  if (tipo === 'png' && data.length >= 24) {
    const v = new DataView(data.buffer); largura = v.getUint32(16); altura = v.getUint32(20);
  } else {
    let i = 2;
    while (i + 8 < data.length) {
      if (data[i] !== 255) { i++; continue; }
      const marca = data[i + 1], tamanho = (data[i + 2] << 8) + data[i + 3];
      if ([192,193,194].includes(marca)) { altura = (data[i + 5] << 8) + data[i + 6]; largura = (data[i + 7] << 8) + data[i + 8]; break; }
      if (!tamanho) break;
      i += tamanho + 2;
    }
  }
  if (!largura || !altura) throw new Error('Não foi possível ler uma imagem do documento.');
  return { src, tipo, data, largura, altura };
}

export function formatoDocumento(timbrado) {
  const ativo = timbrado?.ativo !== false;
  const imagens = {};
  for (const k of ['cabecalho','rodape']) {
    if (ativo && timbrado?.[k] && !timbrado?.imagens?.[k]) throw new Error('O timbrado ainda não foi carregado. Aguarde ou confira Configurações → Papel timbrado.');
    if (ativo && timbrado?.imagens?.[k]) {
      const img = lerImagem(timbrado.imagens[k]);
      const altura = PAGINA.largura * img.altura / img.largura;
      if (altura > PAGINA.altura / 4) throw new Error('Recorte a imagem do timbrado para conter somente a faixa do cabeçalho ou rodapé.');
      imagens[k] = { ...img, alturaMm: altura };
    }
  }
  const margem = timbrado?.margens || {};
  const gap = k => Math.max(0, Math.min(50, Number(margem[k] ?? 2) || 0));
  // Migração do antigo padrão: os 18/16/22 mm eram somados às margens
  // da página, estreitando e deslocando indevidamente o conteúdo.
  const legado = margem.topo === 18 && margem.base === 16 && margem.lateral === 22;
  const topo = Math.max(PAGINA.topo, (imagens.cabecalho?.alturaMm || 0) + (legado ? 2 : gap('topo')));
  const base = Math.max(PAGINA.base, (imagens.rodape?.alturaMm || 0) + Math.max(8, legado ? 2 : gap('base')));
  const lateral = legado ? 0 : Math.max(0, Math.min(20, Number(margem.lateral) || 0));
  return { ...PAGINA, topo, base, esquerda: PAGINA.esquerda + lateral, direita: PAGINA.direita + lateral, imagens };
}

const estilo = el => Object.fromEntries((el?.getAttribute?.('style') || '').split(';').map(s => { const i=s.indexOf(':'); return [s.slice(0,i).trim().toLowerCase(),s.slice(i+1).trim()]; }).filter(([k])=>k));
const tamanhoPt = s => {
  const m = /^(-?[\d.]+)(px|pt|cm|mm)?$/.exec(s || '');
  return m ? Math.max(0, Number(m[1]) * ({px:.75,pt:1,cm:72/2.54,mm:72/25.4}[m[2]] || .75)) : undefined;
};
const margemPt = (s, lado) => {
  if (s['margin-'+lado]) return tamanhoPt(s['margin-'+lado]);
  const v=(s.margin||'').split(/\s+/); return tamanhoPt(lado==='top'?v[0]:v[2]||v[0]);
};
const ignorar = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','NOSCRIPT']);
const containers = new Set(['DIV','SECTION','ARTICLE','MAIN','HEADER','FOOTER','UL','OL','FIGURE','BLOCKQUOTE']);
const blocosTags = new Set([...containers,'P','H1','H2','H3','H4','H5','H6','TABLE','LI','HR','PRE','FIGCAPTION']);
function trechos(el, herdado={}) {
  if (el.nodeType === 3) return [{text:el.textContent.replace(/\s+/g,' '),...herdado}];
  if (el.nodeType !== 1 || ignorar.has(el.tagName)) return [];
  if (el.tagName === 'BR') return [{text:'\n',...herdado}];
  if (el.tagName === 'IMG') return [{imagem:lerImagem(el.getAttribute('src'))}];
  const s=estilo(el);
  const next={...herdado,...(/^(B|STRONG)$/.test(el.tagName)||/bold|[6-9]00/.test(s['font-weight'])?{bold:true}:{}),...(/^(I|EM)$/.test(el.tagName)?{italics:true}:{}),...(el.tagName==='U'?{underline:true}:{}),...(el.tagName==='MARK'?{highlight:true}:{}),...(el.tagName==='SUP'?{superScript:true}:{}),...(el.tagName==='SUB'?{subScript:true}:{})};
  return [...el.childNodes].flatMap(n=>trechos(n,next));
}

export function analisarDocumento(html, {parse=texto=>new DOMParser().parseFromString(texto,'text/html')}={}) {
  const doc=parse(html);
  function ler(parent, contexto={}) {
    const out=[]; let pendentes=[];
    const paragrafo=(el, runs, extra={})=>{
      const s=estilo(el), h=/^H[1-6]$/.test(el?.tagName||'')?Number(el.tagName[1]):0;
      const alignment=s['text-align']||contexto.alignment||(h?'center':contexto.tabela?'left':'justify');
      const assinatura=contexto.assinatura||/border-top/.test(el?.getAttribute?.('style')||'');
      return {type:'p',runs,h,alignment,size:contexto.tabela&&!contexto.assinatura?10:12,line:contexto.tabela?1:1.5,before:margemPt(s,'top')??(h?12:0),after:margemPt(s,'bottom')??(h?18:8),indent:!h&&!contexto.tabela&&alignment==='justify'?mmPt(12.5):0,borderTop:assinatura&&!!s['border-top'],keepNext:!!h,keepTogether:!!assinatura,pageBreak:/always|page/.test(s['page-break-before']||s['break-before']||''),...extra};
    };
    const flush=()=>{if(pendentes.some(r=>r.imagem||r.text?.trim()))out.push(paragrafo(parent,pendentes));pendentes=[];};
    for(const el of parent.childNodes){
      if(el.nodeType===3){pendentes.push(...trechos(el));continue;}
      if(el.nodeType!==1||ignorar.has(el.tagName))continue;
      const tag=el.tagName,s=estilo(el);
      if(tag==='TABLE'){
        flush();const assinatura=el.hasAttribute('data-assinaturas')||!!el.querySelector('[style*="border-top"]');
        const rows=[...el.querySelectorAll('tr')].filter(r=>r.closest('table')===el&&r.querySelector('td,th'));
        if(!rows.length)continue;
        const cols=Math.max(...rows.map(r=>[...r.children].filter(c=>/^(TD|TH)$/.test(c.tagName)).reduce((n,c)=>n+(Number(c.getAttribute('colspan'))||1),0)));
        out.push({type:'table',assinatura,cols,before:margemPt(s,'top')??0,after:8,rows:rows.map(r=>({header:!!r.querySelector('th'),cells:[...r.children].filter(c=>/^(TD|TH)$/.test(c.tagName)).map(c=>({span:Number(c.getAttribute('colspan'))||1,rowSpan:Number(c.getAttribute('rowspan'))||1,blocks:ler(c,{tabela:true,assinatura,alignment:estilo(c)['text-align']||(assinatura?'center':'left')})}))}))});continue;
      }
      if(tag==='HR'){flush();out.push({type:'break'});continue;}
      if(containers.has(tag)&&[...el.children].some(c=>blocosTags.has(c.tagName))){
        flush();const child=ler(el,{...contexto,alignment:s['text-align']||contexto.alignment});
        if(child.length){if(/always|page/.test(s['page-break-before']||s['break-before']||''))child[0].pageBreak=true;out.push(...child);}continue;
      }
      if(blocosTags.has(tag)){
        flush();let runs=trechos(el);if(tag==='LI')runs=[{text:el.parentElement?.tagName==='OL'?`${(Number(el.parentElement.getAttribute('start'))||1)+[...el.parentElement.children].indexOf(el)}. `:'• '},...runs];
        out.push(paragrafo(el,runs,tag==='LI'?{indent:0}:{}));continue;
      }
      pendentes.push(...trechos(el));
    }
    flush();return out;
  }
  const blocks=ler(doc.body||doc);
  // Keep the date with the signature block, not alone at the foot of a page.
  blocks.forEach((b,i)=>{if(b.type==='table'&&b.assinatura&&blocks[i-1]?.type==='p')blocks[i-1].keepNext=true;});
  return blocks;
}

export function documentoHtml(corpo,titulo,timbrado) {
  const f=formatoDocumento(timbrado);
  const imagem=k=>f.imagens[k]?`<img class="timbre ${k}" src="${f.imagens[k].src}" alt=""/>`:'';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparDocumento(titulo)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e8e8e8;color:#000;font:12pt '${FONTE_DOCUMENTO}',serif;line-height:1.5}.folha{position:relative;background:white;width:210mm;min-height:297mm;margin:0 auto;padding:${f.topo}mm ${f.direita}mm ${f.base}mm ${f.esquerda}mm}.timbre{position:absolute;left:0;width:210mm;height:auto}.cabecalho{top:0}.rodape{bottom:0}h1,h2,h3,h4,h5,h6{font-size:12pt!important;color:#000;text-align:center;line-height:1.5;margin:12pt 0 18pt;break-after:avoid}p{font-size:12pt;text-align:justify;text-indent:12.5mm;margin:0 0 8pt;orphans:2;widows:2}p[style*="text-align:center"],p[style*="text-align: center"],p[style*="text-align:right"]{text-indent:0}table{width:100%;border-collapse:collapse;font-size:10pt}td,th{border:1px solid #bbb;padding:5pt;vertical-align:top}th{background:#eee}td p,th p{text-indent:0;font-size:inherit;line-height:1.0}table[data-assinaturas]{break-inside:avoid}table[data-assinaturas] td{border:0;font-size:12pt}img{max-width:100%}mark{background:#ffff00;color:#000}@media print{body{background:white}.folha{margin:0}@page{size:A4;margin:0}}</style></head><body><main class="folha">${imagem('cabecalho')}${corpo}${imagem('rodape')}</main></body></html>`;
}
