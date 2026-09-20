import JSZip from 'jszip';
// Saída OOXML real: imagens incorporadas, cabeçalho e rodapé por seção.
import {Document,Packer,Paragraph,TextRun,ImageRun,Table,TableRow,TableCell,Header,Footer,PageNumber,WidthType,AlignmentType,HeadingLevel,BorderStyle} from 'docx';

export const FORMATO_RELATORIO={largura:11906,altura:16838,topo:1701,esquerda:1701,direita:1134,base:1134};
const limpar=t=>String(t||'').replace(/\u00a0/g,' ');
async function imagem(src,maxWidth=604,maxHeight=850){
 if(!/^data:image\/(png|jpeg|jpg);base64,/i.test(src||''))throw new Error('Uma imagem não está incorporada. Reenvie-a em PNG ou JPG antes de gerar o Word.');
 const tipo=/^data:image\/png/i.test(src)?'png':'jpg';
 const data=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0));
 let w,h;
 if(tipo==='png'){const v=new DataView(data.buffer);w=v.getUint32(16);h=v.getUint32(20);}
 else {let i=2;while(i<data.length){if(data[i]!==255){i++;continue;}const marker=data[i+1];const len=(data[i+2]<<8)+data[i+3];if([192,193,194].includes(marker)){h=(data[i+5]<<8)+data[i+6];w=(data[i+7]<<8)+data[i+8];break;}if(!len)break;i+=2+len;}}
 if(!w||!h)throw new Error('Não foi possível ler as dimensões de uma imagem do documento.');
 const escala=Math.min(maxWidth/w,maxHeight/h,1);
 return new ImageRun({type:tipo,data,transformation:{width:Math.round(w*escala),height:Math.round(h*escala)}});
}
async function trechos(node,estilo={}){
 if(node.nodeType===3)return [new TextRun({...estilo,text:limpar(node.textContent)})];
 if(node.nodeType!==1)return [];
 const tag=node.tagName.toLowerCase();
 if(['script','style','iframe','object'].includes(tag))return [];
 if(tag==='br')return [new TextRun({break:1})];
 if(tag==='img')return [await imagem(node.getAttribute('src'))];
 const next={...estilo,...(['b','strong'].includes(tag)?{bold:true}:{}),...(['i','em'].includes(tag)?{italics:true}:{}),...(tag==='u'?{underline:{}}:{}),...(tag==='mark'?{highlight:'yellow'}:{}),...(tag==='sup'?{superScript:true}:{}),...(tag==='sub'?{subScript:true}:{})};
 return (await Promise.all([...node.childNodes].map(n=>trechos(n,next)))).flat();
}
const borda={style:BorderStyle.SINGLE,size:4,color:'B7B7B7'};
async function blocos(parent,emTabela=false){
 const out=[];let inline=[];
 const flush=()=>{if(inline.length){out.push(new Paragraph({children:inline,alignment:AlignmentType.JUSTIFIED}));inline=[];}};
 for(const el of parent.childNodes){
  if(el.nodeType===3){if(el.textContent.trim())inline.push(...await trechos(el));continue;}
  if(el.nodeType!==1)continue;
  const tag=el.tagName.toLowerCase();
  if(['script','style','iframe','object'].includes(tag))continue;
  if(tag==='table'){
   flush();
   // Modelos podem conter tabelas ainda sem registros. O docx não aceita
   // uma tabela sem linhas: seu cálculo de colunas tenta criar Array(-Infinity).
   const rows=[...el.querySelectorAll('tr')].filter(r=>r.closest('table')===el&&[...r.children].some(c=>['TD','TH'].includes(c.tagName)));
   if(!rows.length)continue;
   const total=Math.max(1,...rows.map(r=>[...r.children].reduce((s,c)=>s+(Number(c.getAttribute('colspan'))||1),0)));
   out.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:await Promise.all(rows.map(async(r,ri)=>new TableRow({tableHeader:ri===0&&!!r.querySelector('th'),children:await Promise.all([...r.children].filter(c=>['TD','TH'].includes(c.tagName)).map(async c=>{
    const span=Number(c.getAttribute('colspan'))||1,children=await blocos(c,true);
    return new TableCell({columnSpan:span,rowSpan:Number(c.getAttribute('rowspan'))||1,width:{size:Math.round(9071*span/total),type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},borders:{top:borda,bottom:borda,left:borda,right:borda},shading:c.tagName==='TH'?{fill:'E8ECEE'}:undefined,children:children.length?children:[new Paragraph('')]});
   }))}))) }));out.push(new Paragraph({spacing:{after:100},text:''}));continue;
  }
  if(['div','section','article','main','header','footer','ul','ol','figure','blockquote'].includes(tag)){
   flush();if(/page-break-before\s*:\s*always|break-before\s*:\s*page/.test(el.getAttribute('style')||''))out.push(new Paragraph({pageBreakBefore:true,text:''}));out.push(...await blocos(el,emTabela));continue;
  }
  if(/^h[1-6]$/.test(tag)||['p','li','figcaption','pre'].includes(tag)){
   flush();const h=/^h[1-6]$/.test(tag)?Number(tag[1]):0;
   const style=el.getAttribute('style')||'';
   const align=/text-align\s*:\s*(center|right|left)/.exec(style)?.[1];
   out.push(new Paragraph({children:[...(tag==='li'&&el.parentElement?.tagName==='OL'?[new TextRun(String((Number(el.parentElement.getAttribute('start'))||1)+[...el.parentElement.children].indexOf(el))+'. ')]:[]),...await trechos(el,emTabela?{size:20}:{})],heading:h?HeadingLevel['HEADING_'+h]:undefined,alignment:align|| (h?AlignmentType.LEFT:AlignmentType.JUSTIFIED),bullet:tag==='li'&&el.parentElement?.tagName!=='OL'?{level:0}:undefined,keepNext:!!h,widowControl:true,pageBreakBefore:/page-break-before\s*:\s*always|break-before\s*:\s*page/.test(style),spacing:{line:240,after:h?160:emTabela?40:120,before:h?200:0}}));continue;
  }
  if(tag==='hr'){flush();out.push(new Paragraph({pageBreakBefore:true,text:''}));continue;}
  inline.push(...await trechos(el));
 }
 flush();return out;
}
export async function gerarDocx(html,titulo,timbrado,{parse=texto=>new DOMParser().parseFromString(texto,'text/html')}={}){
 if(timbrado?.ativo!==false&&['cabecalho','rodape'].some(k=>timbrado?.[k]&&!timbrado?.imagens?.[k]))throw new Error('O timbrado ainda não foi carregado. Aguarde ou confira Configurações → Papel timbrado.');
 const root=parse(html);const children=await blocos(root.body||root);
 const ativo=timbrado?.ativo!==false,imgs=ativo?timbrado?.imagens||{}:{};
 const header=[];if(imgs.cabecalho)header.push(new Paragraph({children:[await imagem(imgs.cabecalho,604,82)],spacing:{after:0,line:240},alignment:AlignmentType.CENTER}));
 const footer=[];if(imgs.rodape)footer.push(new Paragraph({children:[await imagem(imgs.rodape,604,37)],spacing:{after:0,line:240},alignment:AlignmentType.CENTER}));
 footer.push(new Paragraph({children:[new TextRun({children:[PageNumber.CURRENT],size:18})],alignment:AlignmentType.RIGHT,spacing:{after:0,line:200}}));
 const f=FORMATO_RELATORIO;
 const doc=new Document({title:titulo,creator:'Integral Soluções em Engenharia',styles:{default:{document:{run:{font:'Arial',size:24,color:'000000'},paragraph:{spacing:{line:240,after:120},widowControl:true}}},paragraphStyles:[1,2,3,4,5,6].map(i=>({id:'Heading'+i,name:'Heading '+i,basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Arial',size:i===1?28:24,bold:true,color:'000000'},paragraph:{keepNext:true,spacing:{before:200,after:160}}}))},sections:[{properties:{page:{size:{width:f.largura,height:f.altura},margin:{top:f.topo,left:f.esquerda,right:f.direita,bottom:f.base,header:170,footer:170}}},headers:{default:new Header({children:header})},footers:{default:new Footer({children:footer})},children:children.length?children:[new Paragraph(titulo)]}]});
 // Word exige identificadores de desenho únicos, inclusive entre header/footer.
 const zip=await JSZip.loadAsync(await (await Packer.toBlob(doc)).arrayBuffer());let desenho=0;
 for(const path of Object.keys(zip.files).filter(p=>/^word\/(document|header\d+|footer\d+)\.xml$/.test(p))){const xml=await zip.file(path).async('string');zip.file(path,xml.replace(/<wp:docPr id="\d+"/g,()=>'<wp:docPr id="'+(++desenho)+'"'));}
 return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export async function baixarDocx(html,titulo,timbrado,nome){
 const blob=await gerarDocx(html,titulo,timbrado);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=nome.replace(/\.(docx?|html)$/i,'')+'.docx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
