import React from 'react';

export default function AvisoSincronizacao({sync,home=false}){
 const erro=sync.erroGlobal??sync.error,temFila=!!sync.pendencias?.length;
 // A session warning stays discreet (status, not alert) and visible even with a queue.
 const status=sync.statusExportacao||sync.avisoSessao||(temFila?'':sync.status);
 if(!erro&&(!status||status==='Dados compartilhados no Supabase'||home&&!sync.summaryReady&&!sync.summaryError))return null;
 return <div role={erro?'alert':'status'} style={{padding:'8px 18px',background:erro?'var(--warning-bg)':'var(--card)',color:erro?'var(--warning)':'var(--text)',fontSize:13}}>
  {status}{!erro&&sync.tempoReal==='conectado'&&' · Atualizações em tempo real'}
  {erro&&<><br/>{erro}<button className="btn btn-sm" onClick={sync.flush}>{sync.salvamentoConfirmado?'Atualizar dados':'Retomar tentativas automáticas'}</button><button className="btn btn-sm" onClick={sync.reopen}>Baixar cópia completa de recuperação</button></>}
 </div>;
}
