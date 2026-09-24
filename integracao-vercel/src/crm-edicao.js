import {cpfValido,cnpjValido} from './requisitos-moradores.js';
// Etapas em que o cadastro ainda é comercial: o CPF e os demais dados podem ficar em branco.
const ETAPAS_SEM_EXIGENCIA=['Cliente novo','Negociação','Novo','Contato feito','Proposta enviada','Perdido'];
export const exigeDocumentoCRM=status=>!ETAPAS_SEM_EXIGENCIA.includes(String(status??'').trim());
const digitos=v=>String(v??'').replace(/\D/g,'');
export function formatarDocumento(valor){
 const d=digitos(valor);
 if(!d)return '';
 if(d.length===11){if(!cpfValido(d))throw new Error('CPF inválido, confira os dígitos');return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4');}
 if(d.length===14){if(!cnpjValido(d))throw new Error('CNPJ inválido, confira os dígitos');return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');}
 throw new Error('Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos');
}
// Valores exibidos no card, na mesma forma que o banco compara para detectar edição simultânea.
export const valoresCard=c=>({nome:c.nome||c.lead_nome||'',telefone:c.telefone||c.lead_telefone||'',cpf:c.cpf_cnpj||'',municipio_id:c.municipio_id||c.lead_municipio_id||'',nucleo_id:c.nucleo_id||''});
export function prepararEdicaoCard(form,card){
 const nome=String(form.nome??'').trim(),telefone=String(form.telefone??'').trim();
 if(nome.length<2)throw new Error('Informe o nome com pelo menos 2 letras');
 if(telefone&&(!/^[+()0-9 .-]{10,25}$/.test(telefone)||digitos(telefone).length<10))throw new Error('Telefone inválido, use DDD e número');
 const cpf=formatarDocumento(form.cpf);
 if(!cpf&&exigeDocumentoCRM(card.status))throw new Error('O CPF é obrigatório a partir da etapa Contrato');
 if(!card.cliente_id&&!form.municipio_id)throw new Error('Escolha o município do lead');
 const anterior=valoresCard(card);
 return {p_card:card.id,p_nome:nome,p_telefone:telefone,p_cpf:cpf,p_municipio:form.municipio_id||null,p_nucleo:form.nucleo_id||null,p_anterior:anterior};
}
