import {useState} from 'react';
export const responsaveisLead=card=>card.responsaveis_ids||[card.responsavel_id].filter(Boolean);
export function SelecaoComerciais({comerciais,selecionados,alterar,ocupado}) {
 const opcoes=[...comerciais,...selecionados.filter(id=>!comerciais.some(u=>u.erpRef===id)).map(id=>({erpRef:id,nome:'Comercial indisponível',ativo:false}))];
 return <fieldset className="crm-comerciais" disabled={ocupado}><legend>Comerciais responsáveis</legend><p className="ajuda">Marque um ou mais comerciais. O mesmo lead aparecerá para todos os selecionados.</p><div>{opcoes.map(u=><label key={u.erpRef}><input type="checkbox" checked={selecionados.includes(u.erpRef)} disabled={u.ativo===false&&!selecionados.includes(u.erpRef)} onChange={e=>alterar(e.target.checked?[...selecionados,u.erpRef]:selecionados.filter(id=>id!==u.erpRef))}/><span>{u.nome}{u.ativo===false?' (inativo)':''}</span></label>)}</div>{!selecionados.length&&<p className="ajuda">Selecione pelo menos um responsável para salvar.</p>}</fieldset>;
}
export function EditarComerciaisLead({card,comerciais,salvar,cancelar,ocupado,erro}) {
 const [selecionados,setSelecionados]=useState(()=>responsaveisLead(card));
 return <form className="crm-form" onSubmit={e=>{e.preventDefault();if(selecionados.length)salvar(selecionados,responsaveisLead(card));}}><h2>Comerciais do lead</h2><p>{card.nome||card.lead_nome}</p>{erro&&<p role="alert" className="crm-erro">{erro}</p>}<SelecaoComerciais comerciais={comerciais} selecionados={selecionados} alterar={setSelecionados} ocupado={ocupado}/><div className="crm-acoes"><button className="btn btn-primario" disabled={ocupado||!selecionados.length}>Salvar responsáveis</button><button className="btn" type="button" onClick={cancelar} disabled={ocupado}>Cancelar</button></div></form>;
}
