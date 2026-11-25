// USO-C3 — 62% dos cadastros novos ficavam sem WhatsApp nem telefone.
// O contato é pedido logo no começo e a falta dele gera um alerta; nunca um
// bloqueio: há cadastro legítimo sem telefone (importação, ficha comercial,
// morador que ainda não informou), e o campo continua opcional.
const digitos=v=>String(v??'').replace(/\D/g,'');
// Um número local tem ao menos 8 dígitos; texto como "não tem" não é contato.
export const temContatoMorador=telefone=>digitos(telefone).length>=8;
export const ALERTA_SEM_CONTATO='Este cliente está sem WhatsApp ou telefone. Sem contato, a equipe não consegue avisá-lo dos próximos passos.';
// Texto do aviso ao continuar; vazio quando há contato.
export function alertaSemContatoMorador(telefone){
 if(temContatoMorador(telefone))return '';
 return `${ALERTA_SEM_CONTATO}${String(telefone??'').trim()?' O número informado parece incompleto.':''}\n\nContinuar mesmo assim?`;
}
