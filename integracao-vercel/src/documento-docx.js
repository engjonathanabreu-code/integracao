import JSZip from 'jszip';
import {Document,Packer,Paragraph,TextRun,ImageRun,Table,TableRow,TableCell,Header,Footer,PageNumber,WidthType,AlignmentType,BorderStyle,VerticalAlign,HeadingLevel} from 'docx';
import {analisarDocumento,formatoDocumento,PAGINA,FONTE_DOCUMENTO,mmTwip} from './documento-formato.js';

export const FORMATO_RELATORIO=Object.fromEntries(Object.entries(PAGINA).map(([k,v])=>[k,mmTwip(v)]));
const borda={style:BorderStyle.SINGLE,size:4,color:'B7B7B7'};
const semBorda={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
const bordas=b=>({top:b,bottom:b,left:b,right:b});
const alinhamento={justify:AlignmentType.JUSTIFIED,center:AlignmentType.CENTER,right:AlignmentType.RIGHT,left:AlignmentType.LEFT};
function imagem(img,maxWidth,maxHeight=850,pagina){
 const escala=pagina?maxWidth/img.largura:Math.min(maxWidth/img.largura,maxHeight/img.altura,1);
 return new ImageRun({type:img.tipo,data:img.data,transformation:{width:img.largura*escala,height:img.altura*escala},...(pagina?{floating:{horizontalPosition:{relative:'page',offset:0},verticalPosition:{relative:'page',offset:pagina.rodape?Math.round(FORMATO_RELATORIO.altura*635-img.altura*escala*9525):0},behindDocument:true,allowOverlap:true,layoutInCell:false,lockAnchor:true}}:{})});
}
function converter(blocks,largura){
 return blocks.flatMap(b=>{
  if(b.type==='break')return [new Paragraph({pageBreakBefore:true,text:''})];
  if(b.type==='table'){
   const table=new Table({width:{size:largura,type:WidthType.DXA},columnWidths:Array(b.cols).fill(Math.floor(largura/b.cols)),borders:{...bordas(b.assinatura?semBorda:borda),insideHorizontal:b.assinatura?semBorda:borda,insideVertical:b.assinatura?semBorda:borda},rows:b.rows.map(r=>new TableRow({tableHeader:r.header&&!b.assinatura,cantSplit:true,children:r.cells.map(c=>{
    const width=Math.floor(largura*c.span/b.cols),children=converter(c.blocks,width-(b.assinatura?400:200));
    return new TableCell({columnSpan:c.span,rowSpan:c.rowSpan,width:{size:width,type:WidthType.DXA},margins:{top:b.assinatura?100:80,bottom:80,left:b.assinatura?200:100,right:b.assinatura?200:100},borders:bordas(b.assinatura?semBorda:borda),verticalAlign:VerticalAlign.CENTER,shading:r.header&&!b.assinatura?{fill:'E8ECEE'}:undefined,children:children.length?children:[new Paragraph('')]});
   })}))});
   return [ ...(b.before?[new Paragraph({text:'',spacing:{line:20,before:0,after:Math.round(b.before*20)},keepNext:true})]:[]),table,new Paragraph({text:'',spacing:{line:20,after:Math.round(b.after*20)}}) ];
  }
  const children=b.runs.flatMap(r=>r.imagem?[imagem(r.imagem,largura/15)]:String(r.text).split('\n').map((text,i)=>new TextRun({text,...(i?{break:1}:{}),font:FONTE_DOCUMENTO,size:b.size*2,bold:r.bold||!!b.h,italics:r.italics,underline:r.underline?{}:undefined,highlight:r.highlight?'yellow':undefined,superScript:r.superScript,subScript:r.subScript})));
  return [new Paragraph({children,heading:b.h?HeadingLevel['HEADING_'+b.h]:undefined,alignment:alinhamento[b.alignment]||AlignmentType.JUSTIFIED,keepNext:b.keepNext,keepLines:b.keepTogether,widowControl:true,pageBreakBefore:b.pageBreak,indent:{firstLine:Math.round(b.indent*20)},border:b.borderTop?{top:{style:BorderStyle.SINGLE,size:4,color:'000000',space:4}}:undefined,spacing:{line:Math.round(b.line*240),before:Math.round(b.before*20),after:Math.round(b.after*20)}})];
 });
}
export async function gerarDocx(html,titulo,timbrado,options={}){
 const f=formatoDocumento(timbrado),largura=mmTwip(f.largura-f.esquerda-f.direita);
 const children=converter(analisarDocumento(html,options),largura);
 const header=f.imagens.cabecalho?[new Paragraph({children:[imagem(f.imagens.cabecalho,FORMATO_RELATORIO.largura/15,Infinity,{y:0})],spacing:{before:0,after:0,line:20}})]:[];
 const rod=f.imagens.rodape;
 const footer=rod?[new Paragraph({children:[imagem(rod,FORMATO_RELATORIO.largura/15,Infinity,{rodape:true})],spacing:{before:0,after:0,line:20}})]:[];
 footer.push(new Paragraph({children:[new TextRun({children:[PageNumber.CURRENT],font:FONTE_DOCUMENTO,size:18})],alignment:AlignmentType.RIGHT,spacing:{before:0,after:0,line:200}}));
 const doc=new Document({title:titulo,creator:'Integral Soluções em Engenharia',styles:{default:{document:{run:{font:FONTE_DOCUMENTO,size:24,color:'000000'},paragraph:{spacing:{line:360,after:160},widowControl:true}}},paragraphStyles:[1,2,3,4,5,6].map(i=>({id:'Heading'+i,name:'Heading '+i,basedOn:'Normal',next:'Normal',run:{font:FONTE_DOCUMENTO,size:24,bold:true,color:'000000'},paragraph:{keepNext:true}}))},sections:[{properties:{page:{size:{width:FORMATO_RELATORIO.largura,height:FORMATO_RELATORIO.altura},margin:{top:mmTwip(f.topo),left:mmTwip(f.esquerda),right:mmTwip(f.direita),bottom:mmTwip(f.base),header:0,footer:mmTwip((rod?.alturaMm||0)+3)}}},headers:{default:new Header({children:header})},footers:{default:new Footer({children:footer})},children:children.length?children:[new Paragraph(titulo)]}]});
 // Drawing IDs must be unique across body, header and footer.
 const zip=await JSZip.loadAsync(await (await Packer.toBlob(doc)).arrayBuffer());let desenho=0;
 for(const path of Object.keys(zip.files).filter(p=>/^word\/(document|header\d+|footer\d+)\.xml$/.test(p))){const xml=await zip.file(path).async('string');zip.file(path,xml.replace(/<wp:docPr id="\d+"/g,()=>'<wp:docPr id="'+(++desenho)+'"'));}
 return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export async function baixarDocx(html,titulo,timbrado,nome){
 const blob=await gerarDocx(html,titulo,timbrado);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=nome.replace(/\.(docx?|html|pdf)$/i,'')+'.docx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
