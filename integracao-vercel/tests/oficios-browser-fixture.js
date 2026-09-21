export function instalarOficiosFixture(){const registros=[],seq={},files=new Map();window.oficiosTeste=registros;return(url,options,json)=>{
 if(url.pathname==='/api/oficios-analisar'){if(window.falharIAOficios)return json({message:'IA temporariamente indisponível. Registre sem resumo.'},503);return json({resumo:'Solicita análise do processo e emissão de parecer pela prefeitura.',assunto:'Análise do processo',prefeitura:'Prefeitura Teste',numero:seq[new Date().getFullYear()]?seq[new Date().getFullYear()]+1:42,ano:new Date().getFullYear()});}
 if(url.pathname.includes('/storage/v1/object/')&&url.pathname.includes('integracao-oficios/')){if(url.pathname.includes('/sign/'))return json({signedURL:'/object/sign/integracao-oficios/fixture?token=fixture'});files.set(url.pathname,options.body);return json({});}
 const table=url.pathname.split('/').at(-1),ano=Number(url.searchParams.get('ano')?.replace('eq.',''));
 if(table==='integracao_oficios_sequencias')return json(seq[ano]?[{ano,ultimo:seq[ano]}]:[]);
 if(table==='integracao_oficios')return json(registros.filter(o=>o.ano===ano).sort((a,b)=>b.numero-a.numero));
 if(table==='integracao_oficios_operar'){const {p_acao:a,p_dados:d}=JSON.parse(options.body);if(a==='resumo'){const r=registros.find(o=>o.id===d.id);Object.assign(r,d);return json(r);}const ano=Number(d.data_envio.slice(0,4));const r={...d,id:d.pedido,ano};registros.push(r);seq[ano]=r.numero;return json(r);}
};}
