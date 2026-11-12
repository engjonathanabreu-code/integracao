// Download is the recovery path when the browser cannot persist another copy.
// Failure of the optional local backup must not prevent that download.
export async function exportarCopiaRecuperacao({conteudo,baixar,preservar}){
 if(typeof conteudo!=='string')throw new TypeError('Conteúdo da recuperação inválido.');
 await baixar(conteudo);
 try{await preservar(conteudo);return {copiaInterna:true};}
 catch(e){if(e.code==='SESSAO_ALTERADA')throw e;return {copiaInterna:false};}
}
