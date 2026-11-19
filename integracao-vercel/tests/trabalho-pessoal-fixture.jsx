import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import PainelTrabalhoPessoal from '../src/PainelTrabalhoPessoal.jsx';
import '../src/agente-pessoal-teste.css';
import {diaTrabalho} from '../src/trabalho-pessoal.js';
function Fixture(){
 const [setor,setSetor]=useState('topografia'),[rota,setRota]=useState('');
 const [dono,setDono]=useState('eu');
 const metas=[{id:'m1',titulo:'Visitar unidade sintética',status:'Em andamento',prazo:diaTrabalho(),responsaveis:['eu'],checklist:[{titulo:'Conferir levantamento',concluido:false}]},{id:'m2',titulo:'META ALHEIA',status:'Em andamento',responsaveis:['outro']}];
 return <><select aria-label="Perfil" value={setor} onChange={e=>setSetor(e.target.value)}>{['comercial','topografia','projeto','posprotocolo','juridico','financeiro','consulta','diretoria'].map(s=><option key={s}>{s}</option>)}</select><button onClick={()=>setDono('sem-metas')}>Trocar usuário</button><PainelTrabalhoPessoal metas={metas} usuario={{id:'erp_'+dono,erpRef:dono,setor,ativo:true}} ir={r=>setRota(JSON.stringify(r))}/><output>{rota}</output></>;
}createRoot(document.getElementById('root')).render(<Fixture/>);
