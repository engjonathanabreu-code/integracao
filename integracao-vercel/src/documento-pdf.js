import {analisarDocumento,formatoDocumento} from './documento-formato.js';
const pt=mm=>mm*72/25.4;

// Text is written directly into the PDF (selectable/searchable), not a screenshot.
export async function gerarPdf(html,titulo,timbrado,options={}){
 const {jsPDF}=await import('jspdf');
 const f=formatoDocumento(timbrado),doc=new jsPDF({unit:'pt',format:'a4',compress:true});
 doc.setProperties({title:titulo,author:'Integral Soluções em Engenharia'});
 const left=pt(f.esquerda),right=pt(f.largura-f.direita),top=pt(f.topo),bottom=pt(f.altura-f.base),width=right-left;
 const blocks=analisarDocumento(html,options);let y=top;
 const font=(r,size)=>{doc.setFont('times',r.bold?(r.italics?'bolditalic':'bold'):(r.italics?'italic':'normal'));doc.setFontSize(r.superScript||r.subScript?size*.7:size);};
 const measure=(text,r,size)=>{font(r,size);return doc.getTextWidth(text);};
 function lines(b,w){
  const result=[];let parts=[],used=0,indent=b.indent||0;
  const finish=(last=false)=>{while(parts.at(-1)?.space){used-=parts.pop().width;}result.push({parts,width:used,indent,height:b.size*b.line,size:b.size,alignment:b.alignment,last});parts=[];used=0;indent=0;};
  for(const r0 of b.runs){
   if(r0.imagem){
    if(parts.length)finish(true);const img=r0.imagem,scale=Math.min(w/img.largura,(bottom-top)/img.altura,1);
    result.push({imagem:img,width:img.largura*scale,height:img.altura*scale,indent:0});continue;
   }
   const r={...r0,bold:r0.bold||!!b.h};
   for(const token of String(r.text).split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean)){
    if(token==='\n'){finish(true);continue;}
    const space=/^\s+$/.test(token),text=space?' ':token;
    if(space&&!parts.length)continue;
    const tw=measure(text,r,b.size),limit=w-indent;
    if(used+tw>limit&&parts.length){finish();if(space)continue;}
    if(tw>w-indent){
     // Long names/identifiers without spaces must stay inside the margins.
     for(const char of text){const cw=measure(char,r,b.size);if(used+cw>w-indent&&parts.length)finish();parts.push({...r,text:char,width:cw,space:false});used+=cw;}
    }else{parts.push({...r,text,width:tw,space});used+=tw;}
   }
  }
  if(parts.length||!result.length)finish(true);else if(result.length)result.at(-1).last=true;
  return result;
 }
 function layout(blocks,w){return blocks.map(b=>{
  if(b.type==='p'){const ls=lines(b,w);return {...b,lines:ls,height:b.before+b.after+ls.reduce((s,l)=>s+l.height,0)+(b.borderTop?5:0)};}
  if(b.type==='table'){
   // Row spans are kept in Word. Avoid silently changing their meaning in PDF.
   if(b.rows.some(r=>r.cells.some(c=>c.rowSpan>1)))throw new Error('Este modelo tem células mescladas verticalmente. Baixe em Word para preservar a tabela.');
   const pad=b.assinatura?10:5;
   const rows=b.rows.map(r=>{let x=0;const cells=r.cells.map(c=>{const cw=w*c.span/b.cols,items=layout(c.blocks,cw-pad*2),height=items.reduce((s,it)=>s+it.height,0);const cell={...c,x,width:cw,items,height};x+=cw;return cell;});return {...r,cells,height:Math.max(12,...cells.map(c=>c.height))+pad*2};});
   return {...b,rows,pad,width:w,height:b.before+b.after+rows.reduce((s,r)=>s+r.height,0)};
  }
  return {...b,height:0};
 });}
 function page(){
  if(f.imagens.cabecalho){const img=f.imagens.cabecalho;doc.addImage(img.src,img.tipo.toUpperCase(),0,0,pt(f.largura),pt(img.alturaMm),'cabecalho');}
  if(f.imagens.rodape){const img=f.imagens.rodape;doc.addImage(img.src,img.tipo.toUpperCase(),0,pt(f.altura-img.alturaMm),pt(f.largura),pt(img.alturaMm),'rodape');}
  font({},9);doc.setTextColor(0);doc.text(String(doc.getNumberOfPages()),right,pt(f.altura-(f.imagens.rodape?.alturaMm||0)-3),{align:'right'});y=top;
 }
 function nova(){doc.addPage();page();}
 function ensure(h){if(y>top+.1&&y+h>bottom)nova();}
 function drawLine(l,x,yy,w){
  if(l.imagem){doc.addImage(l.imagem.src,l.imagem.tipo.toUpperCase(),x,yy,l.width,l.height);return;}
  const avail=w-l.indent,spaces=l.parts.filter(p=>p.space).length;
  const justify=l.alignment==='justify'&&!l.last&&spaces>0;
  const extra=justify?Math.max(0,(avail-l.width)/spaces):0;
  let xx=x+l.indent+(l.alignment==='center'?(avail-l.width)/2:l.alignment==='right'?avail-l.width:0);
  for(const r of l.parts){font(r,l.size);doc.setTextColor(0);
   if(r.highlight){doc.setFillColor(255,255,0);doc.rect(xx,yy,r.width,l.height,'F');}
   if(!r.space)doc.text(r.text,xx,yy+l.size*.85+(r.superScript?-l.size*.3:r.subScript?l.size*.15:0));
   if(r.underline){doc.setDrawColor(0);doc.setLineWidth(.4);doc.line(xx,yy+l.size*.95,xx+r.width,yy+l.size*.95);}
   xx+=r.width+(r.space?extra:0);
  }
 }
 function drawFixed(items,x,yy,w){
  for(const b of items){
   yy+=b.before||0;
   if(b.type==='p'){if(b.borderTop){doc.setDrawColor(0);doc.setLineWidth(.5);doc.line(x,yy,x+w,yy);yy+=5;}for(const l of b.lines){drawLine(l,x,yy,w);yy+=l.height;}}
   else if(b.type==='table'){for(const r of b.rows){drawRow(b,r,x,yy);yy+=r.height;}}
   yy+=b.after||0;
  }
 }
 function drawRow(t,r,x,yy){
  for(const c of r.cells){
   if(!t.assinatura){doc.setDrawColor(185);doc.setLineWidth(.4);if(r.header){doc.setFillColor(238);doc.rect(x+c.x,yy,c.width,r.height,'FD');}else doc.rect(x+c.x,yy,c.width,r.height);}
   drawFixed(c.items,x+c.x+t.pad,yy+t.pad,c.width-t.pad*2);
  }
 }
 const planned=layout(blocks,width);page();
 for(let bi=0;bi<planned.length;bi++){
  const b=planned[bi];if(b.type==='break'||b.pageBreak){if(y>top+.1)nova();if(b.type==='break')continue;}
  if(b.keepNext){const next=planned[bi+1];const need=b.height+(next?.type==='table'&&next.assinatura?next.height:(next?.before||0)+(next?.lines?.[0]?.height||0));ensure(Math.min(need,bottom-top));}
  if(b.type==='p'){
   if(b.keepTogether||b.h)ensure(b.height);else ensure(b.before+b.lines.slice(0,2).reduce((s,l)=>s+l.height,0));
   y+=b.before;if(b.borderTop){doc.setDrawColor(0);doc.setLineWidth(.5);doc.line(left,y,right,y);y+=5;}
   for(let i=0;i<b.lines.length;i++){
    // Move the last two lines together to avoid a one-line widow.
    ensure(b.lines[i].height+(i===b.lines.length-2?b.lines[i+1].height:0));drawLine(b.lines[i],left,y,width);y+=b.lines[i].height;
   }y+=b.after;
  }else if(b.type==='table'){
   if(b.assinatura)ensure(Math.min(b.height,bottom-top));else ensure(b.before+(b.rows[0]?.height||0));
   y+=b.before;const headers=b.rows.filter(r=>r.header);
   for(let ri=0;ri<b.rows.length;ri++){
    const r=b.rows[ri];
    if(r.height>bottom-top)throw new Error('Uma linha da tabela é maior que a página. Reduza o conteúdo dessa linha ou baixe em Word.');
    if(y+r.height>bottom&&y>top+.1){nova();if(!r.header&&headers.length&&headers.reduce((s,h)=>s+h.height,0)+r.height<=bottom-top){for(const h of headers){drawRow(b,h,left,y);y+=h.height;}}}
    drawRow(b,r,left,y);y+=r.height;
   }y+=b.after;
  }
 }
 return doc.output('blob');
}
export async function baixarPdf(html,titulo,timbrado,nome){
 const blob=await gerarPdf(html,titulo,timbrado),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=nome.replace(/\.(docx?|html|pdf)$/i,'')+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
