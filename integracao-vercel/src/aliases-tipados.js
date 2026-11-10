// Only identifiers/references are rewritten. Free text, documents and descriptions are opaque.
const campos=new Set(['id','erpId','erpRef','financeiroRef','registro_id','referencia_id','tempId','usuarioId','usuario_id','autorId','autor_id','created_by','criado_por','criadoPor','concluido_por','enviado_por','municipioId','municipio_id','remessaId','remessa_id','nucleoId','nucleo_id','processoId','processo_id','metaId','meta_id','planoId','plano_id','etapaId','etapa_id','eventoId','evento_id','agendaId','agenda_id','conversaId','conversa_id','entidade_id','associacao_id','integracao_nucleo_id','kanbanId']);
const listas=new Set(['responsaveis','participantes','comerciais_adicionais','responsaveis_ids','lidaPor']);
const mapas=new Set(['lidaPor','ultimaLeitura','respostas']);
export function remapearIdentidades(valor,aliases,campo=''){
 if(typeof valor==='string')return campos.has(campo)||listas.has(campo)?aliases[valor]||valor:valor;
 if(Array.isArray(valor))return valor.map(v=>remapearIdentidades(v,aliases,campo));
 if(valor&&typeof valor==='object')return Object.fromEntries(Object.entries(valor).map(([k,v])=>[mapas.has(campo)?aliases[k]||k:k,remapearIdentidades(v,aliases,k)]));
 return valor;
}

export function referenciasIdentidades(valor,campo='',saida=new Set()){
 if(typeof valor==='string'&&(campos.has(campo)||listas.has(campo)))saida.add(valor);
 else if(Array.isArray(valor))valor.forEach(v=>referenciasIdentidades(v,campo,saida));
 else if(valor&&typeof valor==='object')Object.entries(valor).forEach(([k,v])=>referenciasIdentidades(v,k,saida));
 return [...saida];
}
