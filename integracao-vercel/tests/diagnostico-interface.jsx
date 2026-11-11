import React from 'react';
import {createRoot} from 'react-dom/client';
import Diagnostico from '../src/DiagnosticoSincronizacao.jsx';
import {definirSessao} from '../src/dados-compartilhados.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
window.relatorioCalls=[];
window.fetch=async(url,opts={})=>{
 window.relatorioCalls.push({url,opts});
 if(opts.method==='POST')return new Response(null,{status:204});
 return new Response(JSON.stringify([{usuario_id:id(1),instalacao_id:id(10),versao:'test',ultimo_contato:new Date(Date.now()-600000).toISOString(),resumo:[]}]),{status:200});
};
definirSessao({user:{id:id(1)},access_token:'token-ficticio',expires_in:3600});
const usuarios=[{erpRef:id(1),nome:'Diretoria fictícia',ativo:true,setor:'diretoria'},{erpRef:id(2),nome:'Pessoa sem contato',ativo:true}];
const sync={diagnosticoPronto:()=>true,pendencias:[{estado:'bloqueado_validacao',original:{modulo:'metas',intencao:{cpf:'conteudo-privado'}},erro:{codigo:'23503'}}]};
createRoot(document.getElementById('root')).render(<Diagnostico sync={sync} usuario={usuarios[0]} usuarios={usuarios}/>);
window.pronto=true;
