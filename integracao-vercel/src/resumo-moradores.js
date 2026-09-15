import {pendencias, campoCompleto} from './requisitos-moradores.js';

// Only these facts leave the server. Personal data and document contents stay out
// of the initial load. The same rule functions serve summaries and detail pages.
export function processosParaPendencias({clientes,complementos}) {
  const byReference=new Map(complementos.map(e=>[e.referencia_id,e]));
  const used=new Set();
  const defaults={requerente:{},conjuge:{},endereco:{},social:{possuiImovel:''},extras:{},docs:[],checks:{},campos:{},campo:{respostas:{},fotos:[]},unidades:[]};
  const result=clientes.map(c=>{
    const e=byReference.get(c.id);if(e)used.add(e.registro_id);
    const d=e?.dados||{}, pj=d.requerente?.tipoPessoa==='juridica';
    return {...defaults,...d,id:e?.registro_id||c.id,financeiroRef:c.id,municipioId:c.municipio_id,remessaId:c.remessa_id,codigo:c.codigo,nucleoId:d.nucleoId||'',etapa:d.etapa||0,
      situacao:d.situacao&&(d.situacao==='Ativo')===c.ativo?d.situacao:c.ativo?'Ativo':'Inativo',
      requerente:{...d.requerente,nome:c.nome,cpf:pj?'':c.cpf_cnpj||'',cnpj:pj?c.cpf_cnpj||'':d.requerente?.cnpj||''}};
  });
  for(const e of complementos)if(!used.has(e.registro_id))result.push({...defaults,...e.dados,id:e.registro_id});
  return result;
}
export function resumirMoradores(carga,contexto) {
  const processos=processosParaPendencias(carga),db={...contexto,processos};
  return processos.map(p=>({id:p.id,financeiroRef:p.financeiroRef,municipioId:p.municipioId,remessaId:p.remessaId,nucleoId:p.nucleoId||'',codigo:p.codigo,etapa:p.etapa,situacao:p.situacao,
    _resumo:true,_compartilhado:true,_pendencias:pendencias(db,p).length,_campoCompleto:campoCompleto(db,p),
    docs:(p.docs||[]).filter(d=>d.status==='recebido').map(d=>({status:d.status,data:d.data})),requerente:{nome:'',cpf:''}}));
}
