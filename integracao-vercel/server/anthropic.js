// Somente servidor: nunca importe este módulo no aplicativo do navegador.
export function cabecalhosAnthropic(){
 const headers={'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'};
 const workspace=process.env.ANTHROPIC_WORKSPACE_ID?.trim();
 if(workspace)headers['anthropic-workspace-id']=workspace;
 return headers;
}
export function erroAnthropic(dados,status){
 const detalhe=dados?.error?.message||'';
 if(/workspace/i.test(detalhe)&&/scoped|workspace-id/i.test(detalhe))return 'A análise está indisponível porque falta configurar o workspace do serviço de IA. Avise a administração. Seus arquivos e textos não foram apagados.';
 return detalhe?`a IA recusou o pedido: ${detalhe}`:`a IA respondeu com código ${status}`;
}
