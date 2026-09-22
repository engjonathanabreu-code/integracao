import {escaparDocumento as esc} from './documento-formato.js';
export const MODELO_OFICIO_PADRAO = {introducao:'A Integral Soluções em Engenharia vem, por meio deste ofício, apresentar a solicitação a seguir.',encerramento:'Agradecemos a atenção e permanecemos à disposição para os esclarecimentos necessários.\n\nAtenciosamente,'};
export const modeloOficio = m => ({...MODELO_OFICIO_PADRAO,...(m&&typeof m==='object'?m:{})});
export function htmlOficio(f){
 const paragrafos=t=>String(t||'').split(/\n\s*\n/).filter(x=>x.trim()).map(x=>`<p>${esc(x.trim()).replaceAll('\n','<br>')}</p>`).join('');
 if(!f.assunto?.trim()||!f.destinatario?.trim()||!f.conteudo?.trim()||!f.assinatura?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(f.data)||!Number.isInteger(Number(f.numero))||Number(f.numero)<1||Number(f.numero)>999999)throw Error('Preencha número, data, destinatário, assunto, conteúdo e assinatura.');
 return `<h1>OFÍCIO Nº ${String(f.numero).padStart(3,'0')}/${f.data.slice(0,4)}</h1><p style="text-align:right">${esc(f.local?f.local+', ':'')}${f.data.split('-').reverse().join('/')}</p>${paragrafos(f.destinatario)}<p><strong>Assunto: ${esc(f.assunto)}</strong></p>${paragrafos(f.introducao)}${paragrafos(f.conteudo)}${paragrafos(f.encerramento)}<p style="text-align:center">${esc(f.assinatura).replaceAll('\n','<br>')}</p>`;
}
