const texto=v=>typeof v==='string'?v.trim():'';
const data=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:/^\d{2}\/\d{2}\/\d{4}$/.test(v||'')?v.split('/').reverse().join('-'):'';
export function sugestoesDaLeitura(d,secao){
 const matricula=texto(d?.matricula?.numero),atos=Array.isArray(d?.historico_registro)?d.historico_registro:[];
 if(secao==='matriculas'){
  const m=d?.imovel||{},p=d?.proprietario||{},unidade=texto(m.unidade_area).toLowerCase().replace('²','2');
  // Converte somente uma unidade de área explicitamente declarada.
  const fator=['m2','m²'].includes(unidade)?1:['ha','hectare','hectares'].includes(unidade)?10000:null;
  return [{numero:matricula,cartorio:[texto(d?.matricula?.cartorio),texto(d?.matricula?.comarca)].filter(Boolean).join(' / '),descricao:texto(m.descricao),area:Number.isFinite(m.area_registral)&&fator?String(m.area_registral*fator).replace('.',','):'',proprietarios:p.nome?[{nome:texto(p.nome),cpfCnpj:texto(p.cpf)||texto(p.cnpj)}]:[],observacoes:[texto(d?.situacao_matricula?.texto_origem),...atos.map(a=>[a.ato,a.tipo,a.descricao].filter(Boolean).join(' — '))].filter(Boolean).join('\n')}];
 }
 if(secao==='dominial')return atos.filter(a=>a.de||a.para).map(a=>({nome:texto(a.para),matricula,registro:texto(a.ato),data:data(a.data),titulo:texto(a.tipo),observacoes:[a.de?'Transmitente: '+texto(a.de):'',texto(a.descricao),a.data?'Data no documento: '+texto(a.data):''].filter(Boolean).join('\n')}));
 if(secao==='usucapiao')return atos.filter(a=>/usucapi[aã]o/i.test(a.tipo||'')).map(a=>({nome:texto(a.ato),matricula,beneficiario:texto(a.para),data:data(a.data),documento:[texto(a.ato),texto(a.descricao)].filter(Boolean).join(' — ')}));
 return [];
}
export const LISTA_LEITURA={matriculas:'matriculas',dominial:'proprietariosCadeiaDominial',usucapiao:'areasUsucapidas'};
export function incluirSugestoesNUI(draft,resultado,secao,itens,usuario,agora=new Date().toISOString()){
 const lista=LISTA_LEITURA[secao];if(!lista||!itens.length)throw new Error('Selecione ao menos um registro.');
 if(!resultado.hash||!usuario?.id)throw new Error('Origem da análise ou responsável ausente.');
 if((draft.leiturasMatriculas||[]).some(r=>r.hash===resultado.hash&&r.secao===secao))throw new Error('Este arquivo já foi confirmado nesta seção. Revise os registros existentes.');
 const revisao={id:crypto.randomUUID(),hash:resultado.hash,arquivo:resultado.arquivo,modelo:resultado.modelo,analisadoEm:resultado.analisadoEm,secao,confirmadoPorId:usuario.id,confirmadoPor:usuario.nome,confirmadoEm:agora};
 return {...draft,[lista]:[...(draft[lista]||[]),...itens.map(item=>({...structuredClone(item),id:crypto.randomUUID(),leituraId:revisao.id}))],leiturasMatriculas:[...(draft.leiturasMatriculas||[]),revisao]};
}
