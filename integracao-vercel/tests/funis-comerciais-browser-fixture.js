import {alterarFunil,funilVazio} from '../src/funil-institucional.js';

// Browser-only transport fixture. Authorization itself is verified against Postgres
// in funis-comerciais-rls.test.js; no request here reaches a real database.
export function instalarFunisFixture(base) {
 base.integracao_funil_comerciais=[];
 base.integracao_funis_institucionais=[];base.integracao_funil_nuvem=[{id:'compartilhada',dados:funilVazio(),revisao:0}];
 const pedidos=new Map();
 return (url,options,json)=>{
  const tabela=url.pathname.split('/').at(-1),ator=base.profiles[0];
  const admin=ator.ativo&&['Administrador','Diretor Técnico','Diretor de Projetos'].includes(ator.tipo);
  const proprio=ator.ativo&&ator.tipo==='Comercial';
  const membro=base.integracao_funil_comerciais.some(p=>p.id===ator.id&&p.habilitado);
  if(['integracao_configuracoes','integracao_complementos'].includes(tabela)&&!admin&&(!options.method||options.method==='GET')) {
   return json(base[tabela].filter(r=>r.colecao!=='config'||r.registro_id!=='funilInstitucional'));
  }
  if(['integracao_funil_comerciais','integracao_funis_institucionais','integracao_funil_nuvem'].includes(tabela)) {
   if(options.method&&options.method!=='GET')return json({message:'permission denied'},403);
   return json(base[tabela].filter(r=>admin||(proprio&&membro&&(tabela!=='integracao_funis_institucionais'||r.id===ator.id))));
  }
  if(tabela==='integracao_nuvem_salvar'){
   if(!(admin||(proprio&&membro)))return json({message:'Seu usuário não pode editar a Nuvem.'},403);
   const p=JSON.parse(options.body),a=p.p_acao,key=ator.id+':cloud:'+p.p_pedido,body=JSON.stringify(p),cached=pedidos.get(key);
   if(cached)return cached.corpo===body?json(cached.resultado):json({message:'Pedido com outro conteúdo.'},409);
   const row=base.integracao_funil_nuvem[0];if(row.revisao!==p.p_revisao)return json({message:'A Nuvem mudou. Atualize antes de salvar.',code:'PT409'},409);
   try{
    const data=structuredClone(row.dados),previous=data.cidades.find(c=>c.id===a.id);let target=null,flow=null,novo=null;
    if(a.etapa==='prospeccao'){
     if(!a.responsavelId)throw new Error('Selecione o responsável pela Prospecção.');
     if(!previous)throw new Error('O município não está mais na Nuvem.');
     target=base.integracao_funil_comerciais.find(c=>c.id===a.responsavelId&&c.habilitado);if(!target)throw new Error('Responsável não habilitado.');
     flow=base.integracao_funis_institucionais.find(f=>f.id===target.id);
     novo=alterarFunil(flow?.dados||funilVazio(),{...previous,tipo:'cidade',etapa:'prospeccao',eventoId:p.p_pedido},{autor:ator.nome});data.cidades=data.cidades.filter(c=>c.id!==a.id);
    }else{
     if(a.responsavelId)throw new Error('A Nuvem não tem responsável.');
     const source=base.integracao_funis_institucionais.find(f=>f.dados.cidades.some(c=>c.id===a.id));
     if(!previous&&source){
      if(source.id!==ator.id)throw new Error('Município já atribuído.');
      if(source.revisao!==p.p_funil_revisao)throw new Error('O funil mudou. Atualize.');
      if(source.dados.nucleos.some(n=>n.cidadeId===a.id))throw new Error('Preserve os núcleos associados.');
      target={id:ator.id};flow=source;novo=structuredClone(source.dados);const city=novo.cidades.find(c=>c.id===a.id);novo.cidades=novo.cidades.filter(c=>c.id!==a.id);
      data.cidades.push({...city,etapa:'nuvens'});
     }else{const result=alterarFunil(data,{...a,eventoId:p.p_pedido},{autor:ator.nome});data.cidades=result.cidades;}
    }
    const evento={id:p.p_pedido,data:new Date().toISOString(),autor:ator.nome,acao:a};data.historico.push(evento);
    if(target){const updated={id:target.id,dados:novo,revisao:(flow?.revisao||0)+1};if(flow)Object.assign(flow,updated);else{flow=updated;base.integracao_funis_institucionais.push(updated);}}
    Object.assign(row,{dados:data,revisao:row.revisao+1});const result={nuvem:structuredClone(row),funil:target&&(admin||target.id===ator.id)?structuredClone(flow):null};pedidos.set(key,{corpo:body,resultado:result});return json(result);
   }catch(e){return json({message:e.message},409);}
  }
  if(tabela!=='integracao_funil_salvar')return undefined;
  if(!proprio||!membro)return json({message:'Seu usuário não está habilitado para editar um funil individual.'},403);
  const p=JSON.parse(options.body),chave=ator.id+':'+p.p_pedido,corpo=JSON.stringify(p);
  const repetido=pedidos.get(chave);
  if(repetido)return repetido.corpo===corpo?json(repetido.resultado):json({message:'Pedido usado com outro conteúdo.'},409);
  const anterior=base.integracao_funis_institucionais.find(r=>r.id===ator.id);
  if(p.p_revisao!==(anterior?.revisao||0))return json({code:'PT409',message:'Este fluxo mudou. Atualize antes de salvar.'},409);
  try {
   const dados=alterarFunil(anterior?.dados||funilVazio(),{...p.p_acao,eventoId:p.p_pedido},{autor:ator.nome});
   const resultado={id:ator.id,dados,revisao:(anterior?.revisao||0)+1};
   if(anterior)Object.assign(anterior,resultado);else base.integracao_funis_institucionais.push(resultado);
   pedidos.set(chave,{corpo,resultado:structuredClone(resultado)});
   return json(resultado);
  }catch(e){return json({message:e.message},400);}
 };
}
