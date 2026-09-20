import {requisicao} from './dados-compartilhados.js';
export async function registrarAcesso(evento,motivo){
 try {await requisicao('rpc/integracao_registrar_acesso',{method:'POST',body:JSON.stringify({p_evento:evento,p_motivo:motivo}),signal:AbortSignal.timeout(10000)});}
 catch {throw new Error('Não foi possível registrar o acesso. Verifique a conexão e tente novamente.');}
}
