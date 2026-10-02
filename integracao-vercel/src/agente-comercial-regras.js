import {normalizarCRM,acessoCRM} from './crm-regras.js';
export const podeUsarAgenteComercial=usuario=>!!usuario&&usuario.ativo!==false&&normalizarCRM(usuario.tipoERP||usuario.tipo)==='comercial';
const responsaveisLead=c=>c.responsaveis_ids||[c.responsavel_id].filter(Boolean);
export const cardsDaCarteira=(cards,usuario)=>acessoCRM(usuario).comercial?cards.filter(c=>!c.arquivado_em&&c.origem!=='vinculado'&&(acessoCRM(usuario).admin||responsaveisLead(c).includes(usuario.erpRef))):[];
export function followupsVencidos(cards,followups,usuario,agora=Date.now()) {
 if(!podeUsarAgenteComercial(usuario))return [];
 const permitidos=new Map(cardsDaCarteira(cards,usuario).filter(c=>!['Perdido','Cliente ativo'].includes(c.status)).map(c=>[c.id,c]));
 return followups.filter(f=>f.status==='pendente'&&Number.isFinite(Date.parse(f.previsto_em))&&Date.parse(f.previsto_em)<agora&&permitidos.has(f.card_id)).sort((a,b)=>Date.parse(a.previsto_em)-Date.parse(b.previsto_em)).map(f=>({...f,card:permitidos.get(f.card_id)}));
}
export function dadosPedidoComercial(texto,municipios=[]) {
 const nome=texto.match(/(?:lead|potencial cliente)\s+(?:(?:chamado|chamada|de nome|com nome|para|de)\s+)?["“]?(.+?)["”]?(?=\s*(?:[,;]|(?:com\s+)?(?:telefone|celular|whatsapp|municipio|município|cidade)\b)|$)/i)?.[1]?.trim();
 const telefone=texto.match(/(?:telefone|celular|whatsapp)\s*(?:para|:|=)?\s*([+\d(][\d\s().-]{7,24})/i)?.[1]?.trim();
 const cidade=texto.match(/(?:munic[ií]pio|cidade)\s*(?:de\s+|:|=)?\s*(.+?)(?=[,;]|$)/i)?.[1]?.trim();
 const matches=cidade?municipios.filter(m=>normalizarCRM(m.nome)===normalizarCRM(cidade.replace(/\s*\/\s*[a-z]{2}$/i,''))):[];
 const cpf=texto.match(/\bcpf\s*(?:para|:|=)?\s*([\d.-]{11,14})(?![\d.-])/i)?.[1]||'';
 const nomeAlterado=texto.match(/\bnome\s*(?:para|:|=)\s*(.+?)(?=[,;]|$)/i)?.[1]?.trim()||'';
 return {cpf,nomeAlterado,nome:nome||'',telefone:telefone||'',municipio:matches.length===1?matches[0].id:'',conteudo:texto.match(/(?:relato|atendimento|informa[cç][aã]o)\s*:\s*(.+)$/i)?.[1]?.trim()||'',modo:/atendimento|relato/i.test(texto)?'atendimento':/edit|alter|preench|atualiz|complet/i.test(texto)?'editar':null};
}
export function followupsPrioritarios(cards,followups,usuario,agora=Date.now()){
 if(!podeUsarAgenteComercial(usuario))return [];
 const carteira=new Map(cardsDaCarteira(cards,usuario).filter(c=>c.status!=='Perdido').map(c=>[c.id,c]));
 const vistos=new Set();return followups.filter(f=>f.status==='pendente'&&Number.isFinite(Date.parse(f.previsto_em))&&Date.parse(f.previsto_em)<=agora+24*60*60*1000&&carteira.has(f.card_id)).sort((a,b)=>Date.parse(a.previsto_em)-Date.parse(b.previsto_em)).filter(f=>{if(vistos.has(f.card_id))return false;vistos.add(f.card_id);return true}).map(f=>({...f,card:carteira.get(f.card_id)}));
}
