import {escaparDocumento as esc} from './documento-formato.js';
export const MODELO_OFICIO_PADRAO = {
 local:'Ibirama-SC',
 destinatario:'À Comissão de Regularização Fundiária Urbana',
 assunto:'Esclarecimentos e requerimentos relativos à regularização fundiária urbana',
 introducao:'A INTEGRAL SOLUÇÕES EM ENGENHARIA LTDA., pessoa jurídica de direito privado, inscrita no CNPJ nº 29.212.382/0001-07, com sede na Rua Tiradentes, nº 262, Centro, Ibirama/SC, na qualidade de responsável técnica pelo acompanhamento dos procedimentos de Regularização Fundiária Urbana (REURB), vem, respeitosamente, apresentar os seguintes esclarecimentos e requerimentos.',
 conteudo:'1. Esclarecimentos\n[Descrever os fatos e os esclarecimentos pertinentes ao assunto.]\n\n2. Documentos e informações\n[Relacionar os documentos apresentados e as informações que fundamentam a manifestação.]\n\n3. Requerimentos\n[Indicar, de forma objetiva, as providências solicitadas à Comissão.]',
 encerramento:'Permanecemos à disposição para prestar informações complementares e esclarecer eventuais dúvidas.\n\nAtenciosamente,',
 assinatura:'INTEGRAL SOLUÇÕES EM ENGENHARIA LTDA.\nMARCOS PAULO BAUCELLI\nAdvogado — OAB/SC 50.473',
};
export const CAMPOS_MODELO_OFICIO=[['local','Local de emissão padrão',2,200],['destinatario','Destinatário padrão do ofício',3,1000],['assunto','Assunto padrão do ofício',2,300],['introducao','Introdução padrão do ofício',6,10000],['conteudo','Conteúdo padrão do ofício',10,30000],['encerramento','Encerramento padrão do ofício',4,10000],['assinatura','Assinatura padrão do ofício',3,1000]];
export const modeloOficio = m => ({...MODELO_OFICIO_PADRAO,...Object.fromEntries(Object.entries(m&&typeof m==='object'?m:{}).filter(([k,v])=>Object.hasOwn(MODELO_OFICIO_PADRAO,k)&&typeof v==='string'))});
export const novoOficio = (modelo,data,proximo) => ({...modeloOficio(modelo),numero:proximo|| (data.startsWith('2026-')?309:1),data,referencia:'',nucleo:'',processo:'',protocolo:'',orientacao:''});
export function htmlOficio(f){
 const paragrafos=t=>String(t||'').split(/\n\s*\n/).filter(x=>x.trim()).map(x=>`<p>${esc(x.trim()).replaceAll('\n','<br>')}</p>`).join('');
 if(!f.assunto?.trim()||!f.destinatario?.trim()||!f.conteudo?.trim()||!f.assinatura?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(f.data)||!Number.isInteger(Number(f.numero))||Number(f.numero)<1||Number(f.numero)>999999)throw Error('Preencha número, data, destinatário, assunto, conteúdo e assinatura.');
 const referencias=[['Ref.',f.referencia],['Núcleo Urbano Informal',f.nucleo],['Processo Administrativo nº',f.processo],['Data do protocolo',f.protocolo?f.protocolo.split('-').reverse().join('/'):null]].filter(([,v])=>v?.trim()).map(([k,v])=>`<p><strong>${k}:</strong> ${esc(v)}</p>`).join('');
 const data=new Date(`${f.data}T12:00:00`).toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
 return `${paragrafos(f.destinatario)}<h1>OFÍCIO Nº ${String(f.numero).padStart(3,'0')}/${f.data.slice(0,4)}</h1>${referencias}<p><strong>Assunto: ${esc(f.assunto)}</strong></p>${paragrafos(f.introducao)}${paragrafos(f.conteudo)}${paragrafos(f.encerramento)}<p style="text-align:right">${esc(f.local?f.local+', ':'')}${esc(data)}.</p><p style="text-align:center">______________________________________<br>${esc(f.assinatura).replaceAll('\n','<br>')}</p>`;
}
