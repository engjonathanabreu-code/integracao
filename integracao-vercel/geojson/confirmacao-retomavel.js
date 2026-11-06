// Retoma o recibo da intenção original sem reaplicar a edição sobre o estado otimista.
export function criarConfirmacaoRetomavel(){
  let tentativa=null,versao=0;
  const invalidar=()=>{tentativa=null;versao++;};
  const executar=async(chave,original)=>{
    if(tentativa?.chave!==chave){invalidar();tentativa={chave,retentar:null};}
    const token=versao,retentar=tentativa.retentar;
    try{
      const resultado=await (retentar?retentar():original());
      if(versao===token)invalidar();
      return resultado;
    }catch(erro){
      if(versao===token)tentativa=typeof erro?.retentarConfirmacao==='function'?{chave,retentar:()=>erro.retentarConfirmacao()}:null;
      throw erro;
    }
  };
  return {executar,invalidar};
}
