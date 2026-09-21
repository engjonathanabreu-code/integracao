// Captura cada estado no momento da chamada e grava em ordem, inclusive ao sair.
export function filaRascunho(storage){
 let ultima=Promise.resolve();
 return (chave,conteudo,conta)=>{
  const proxima=ultima.catch(()=>{}).then(async()=>{await storage.set(chave,conteudo);await storage.set('integracao-ultima-conta',conta);});
  ultima=proxima;return proxima;
 };
}
