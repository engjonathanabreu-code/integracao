import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Pendencias from '../src/PendenciasSincronizacao.jsx';
function Harness(){
 const [previa,setPrevia]=useState(null);const base={id:'pedido-recusado',estado:'bloqueado_validacao',tentativas:1,original:{modulo:'metas'},erro:{status:403,codigo:'42501',categoria:'permissao',rejeicaoConfirmada:true}},incerta={...base,id:'pedido-incerto',erro:{status:401,codigo:'PGRST301',categoria:'sessao',rejeicaoConfirmada:false}};
 const sync={pendencias:[base,incerta],previaPendencia:previa,abrirPendencia:async id=>setPrevia({id,item:id===base.id?base:incerta,edicoes:[],conflitos:[],dados:{}}),fecharPrevia:()=>setPrevia(null),descartarPendencia:async()=>{window.descartes=(window.descartes||0)+1;setPrevia(null);},resolverPendencia:async()=>{window.retomadas=(window.retomadas||0)+1;setPrevia(null);}};
 return <Pendencias sync={sync}/>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
