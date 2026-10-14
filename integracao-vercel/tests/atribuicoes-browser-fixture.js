export function instalarAtribuicoesFixture(base,id){
 if(!new URLSearchParams(location.search).has('atribuicoes'))return null;
 base.profiles.push({id:id(70),nome:'Perfil sintético Topografia',tipo:'Topografia',ativo:true});
 const drafts=new Map();window.rascunhosFixture=drafts;window.fluxoWrites=[];
 return (nome,body)=>{
  if(nome==='integracao_atribuicoes_ler')return drafts.get(body.p_usuario_id)||{revisao:0,matriz:{schema_version:1,atribuicoes:[]},historico:[]};
  if(nome==='integracao_atribuicoes_salvar'){
   if(body.p_usuario_id===id(1))throw Error('Autoedição bloqueada');
   const antes=drafts.get(body.p_usuario_id)||{revisao:0};if(antes.revisao!==body.p_revisao_esperada)throw Error('Conflito de revisão');
   const next={revisao:antes.revisao+1,matriz:body.p_matriz,historico:[{motivo:body.p_motivo}]};drafts.set(body.p_usuario_id,next);window.fluxoWrites.push(body);return next;
  }
  return undefined;
 };
}
