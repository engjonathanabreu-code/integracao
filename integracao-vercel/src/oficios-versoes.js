// O ID externo e a numeração pertencem sempre ao ofício original.
export function oficioAtual(oficio){
 const {versoes=[],...original}=oficio;
 const atual=versoes.reduce((a,v)=>!a||v.versao>a.versao?v:a,null);
 return {...original,...atual,id:original.id,ano:original.ano,numero:original.numero,versao:atual?.versao||1,versao_id:atual?.id||original.id};
}
export function dadosNovaVersao(oficio,pedido){
 return {pedido,oficio_id:oficio.id,base_id:oficio.versao_id,prefeitura:oficio.prefeitura,assunto:oficio.assunto,resumo:oficio.resumo,resumo_status:oficio.resumo_status,
 caminho:oficio.caminho,nome_arquivo:oficio.nome_arquivo,mime:oficio.mime,tamanho:oficio.tamanho,sha256:oficio.sha256};
}
