export async function verificarRetomadaCadastro(){
 const {abrirFilaIntencoes,processarIntencao}=await import('../src/fila-intencoes.js');
 const {criarDiarioCompartilhado}=await import('../src/diario-compartilhado.js');
 let tempo=1000000;
 const abrirFila=()=>abrirFilaIntencoes({nome:'cadastro-transporte-fixture',agora:()=>tempo,aleatorio:()=>0});
 const fila=abrirFila();
 const erro=status=>Object.assign(Error('fixture'),{status});
 const novo=(conta,id,auditoriaId,opcoes={})=>fila.enfileirar({conta,id,unidade:id,modulo:opcoes.modulo||'processos',operacoes:[{table:'integracao_moradores',key:{registro_id:id},changes:{dados:{exemplo:2}}}],base:{},intencao:{edicoes:[{colecao:'auditoria',id:auditoriaId,antes:{existe:false},depois:{existe:true,valor:{id:auditoriaId,acao:'Cadastro alterado'}}}]},...opcoes});
 const falhar=async(conta,id,status,emEnvio=true,tentativas=5)=>{
  for(let n=0;n<tentativas;n++){
   let item=await fila.reservar(conta,{dono:'original',somenteId:id});
   if(emEnvio)item=await fila.registrarEnvio(item);
   await fila.registrarFalha(item,erro(status),{fase:emEnvio?'envio':'recibo'});
   tempo+=100000;
  }
 };
 const conta='certificada',auditoria='audit-certificada',id='pedido-certificado';
 await novo(conta,id,auditoria);await novo(conta,'outro','audit-outra');
 await falhar(conta,id,503);await falhar(conta,'outro',503);
 const [antes,outra]=await fila.listar(conta);
 const eventos=[];
 const d=criarDiarioCompartilhado({conta,fila:abrirFila(),ativo:()=>true,carregar:async()=>({db:{}}),preparar:async()=>{eventos.push('preparar');return {};},enviar:async()=>{eventos.push('reenviar');return {};},consultarRecibo:async item=>{eventos.push(['recibo',item.pedido]);return {aliases:{}};},confirmar:async item=>eventos.push(['leitura',item.pedido]),atualizou:()=>{}});
 const antesSemRetomar=await d.executar({id});
 const rearmou=await d.rearmarCadastro(auditoria);
 const depoisDeRearmar=(await fila.listar(conta))[0];
 const repetido=await d.rearmarCadastro(auditoria);
 await d.executar({id});const [final,outraFinal]=await fila.listar(conta);
 const iguais=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const essenciais=({pedido,checksum,original,payload,tentativas,tentativasTotais,falhas})=>({pedido,checksum,original,payload,tentativas,tentativasTotais,falhas});
 const recuperado={antes:antesSemRetomar[0].estado,rearmou,repetido,mesmaIdentidade:iguais(essenciais(antes),essenciais(depoisDeRearmar)),outroIntacto:iguais(outra,outraFinal),final:final.estado,eventos};
 d.fechar();
 const guardas=async(conta,estado)=>{
  const antes=await fila.listar(conta);const alterou=await fila.rearmarCadastro(conta,'audit');const depois=await fila.listar(conta);
  return [estado,alterou,iguais(antes,depois)];
 };
 const u='retentativa-incerta';await novo(u,'incerto','audit-incerta');await falhar(u,'incerto',503);
 await fila.rearmarCadastro(u,'audit-incerta');const eventosIncerto=[];
 const criticos={conta:u,dono:'teste',sessaoAtual:()=>true,preparar:async()=>{throw Error('não pode preparar pedido fixado');},consultarRecibo:async item=>{eventosIncerto.push(['consulta',item.pedido]);return null;},enviar:async item=>{eventosIncerto.push(['envio',item.pedido]);return {aliases:{}};},reler:async()=>eventosIncerto.push('leitura')};
 const incerto=await processarIntencao(fila,criticos);
 const falhaNaConsulta='consulta-falha';await novo(falhaNaConsulta,'incerto','audit-falha');await falhar(falhaNaConsulta,'incerto',503);
 await fila.rearmarCadastro(falhaNaConsulta,'audit-falha');let naoEnviar=0;
 try{await processarIntencao(fila,{...criticos,conta:falhaNaConsulta,consultarRecibo:async()=>{throw erro(503);},enviar:async()=>{naoEnviar++;}});}catch(e){if(e.status!==503)throw e;}
 const parada=(await fila.listar(falhaNaConsulta))[0];
 const bloqs=[];
 // The same real store verifies non-eligible records are untouched.
 for(const [nome,status,qt] of [['permissao',403,1],['intervalo',503,1],['limite-rate',429,5],['validacao',422,1]]){
  await novo(nome,nome,'audit');await falhar(nome,nome,status,true,qt);
  if(nome==='intervalo')tempo-=100000;
  const antes=await fila.listar(nome);const a=await fila.rearmarCadastro(nome,'audit');bloqs.push([nome,a,iguais(antes,await fila.listar(nome))]);
  if(nome==='intervalo')tempo+=100000;
 }
 await novo('modulo','meta','audit',{modulo:'metas'});await falhar('modulo','meta',503);
 const metaAntes=await fila.listar('modulo');const metaRearmada=await fila.rearmarCadastro('modulo','audit');bloqs.push(['modulo',metaRearmada,iguais(metaAntes,await fila.listar('modulo'))]);
 const vazio=await guardas('outra-conta','outra-conta');
 const confirmadasAntes=await fila.listar(u);const armarConfirmada=await fila.rearmarCadastro(u,'audit-incerta');bloqs.push(['recibo',armarConfirmada,iguais(confirmadasAntes,await fila.listar(u))]);
 await fila.fechar();
 // Contrato C1: falha transitória nunca agenda MAX_SAFE_INTEGER. A consulta que falhou
 // mantém o resultado desconhecido, com backoff, sem reenviar.
 return {recuperado,eventosIncerto,incerto:incerto.estado,naoEnviar,permaneceIncerta:parada.estado==='resultado_desconhecido'&&parada.proximaTentativa!==Number.MAX_SAFE_INTEGER&&!parada.recibo,bloqs,vazio};
}

// Contrato C1 (docs/correcao-sincronizacao-multiagente.md): cinco falhas transitórias já
// não esgotam o pedido. A retomada automática consulta o recibo do mesmo pedido antes de
// qualquer reenvio e confirma pela releitura; o reparo rearmarCadastro fica sem candidato.
export const esperado={
   recuperado:{antes:'confirmado',rearmou:false,repetido:false,mesmaIdentidade:true,outroIntacto:true,final:'confirmado',eventos:[['recibo','pedido-certificado'],['leitura','pedido-certificado']]},
   eventosIncerto:[['consulta','incerto'],['envio','incerto'],'leitura'],incerto:'confirmado',
   naoEnviar:0,permaneceIncerta:true,
   bloqs:['permissao','intervalo','limite-rate','validacao','modulo','recibo'].map(nome=>[nome,false,true]),
   vazio:['outra-conta',false,true]
  };
