const campos=['id','financeiroRef','municipioId','remessaId','nucleoId','codigo','etapa','situacao','_pendencias','_campoCompleto','docs','extras'];
export const compactarResumo=moradores=>moradores.map(p=>campos.map(k=>p[k]??null));
export const expandirResumo=rows=>rows.map(r=>({...Object.fromEntries(campos.map((k,i)=>[k,r[i]])),_resumo:true,_compartilhado:true,requerente:{nome:'',cpf:''}}));
