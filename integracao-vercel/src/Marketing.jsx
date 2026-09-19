import {useState} from 'react';
import {Radio,MessageCircle,CalendarDays,Route} from 'lucide-react';
import {acessoCRM} from './crm-regras.js';
import JornadaMarketing from './JornadaMarketing.jsx';
import GruposMarketing from './GruposMarketing.jsx';
import RotinaMarketing from './RotinaMarketing.jsx';
import './marketing.css';
const ABAS=[['jornada','Jornada de comunicação',Route],['grupos','Grupos de WhatsApp',MessageCircle],['rotina','Rotina mensal',CalendarDays]];
export default function Marketing(props) {
 const [aba,setAba]=useState('jornada');
 if(!acessoCRM(props.usuario).marketing)return <div className="contem"><h1>Marketing</h1><p>Acesso restrito ao Marketing e à administração.</p></div>;
 return <div className="contem largo mkt-pagina"><header className="mkt-hero"><div className="mkt-hero-simbolo"><Radio size={30}/></div><div><span className="mkt-eyebrow">Comunicação & relacionamento</span><h1>Marketing</h1><p>Conecte municípios, acompanhe a jornada e organize as próximas entregas.</p></div><div className="mkt-hero-detalhe" aria-hidden="true"><MessageCircle size={54}/><span/><span/></div></header><nav className="mkt-abas" aria-label="Áreas de Marketing">{ABAS.map(([id,nome,Icone])=><button key={id} aria-pressed={aba===id} className={aba===id?'ativa':''} onClick={()=>setAba(id)}><Icone size={19}/>{nome}</button>)}</nav>{aba==='jornada'&&<JornadaMarketing {...props}/>} {aba==='grupos'&&<GruposMarketing {...props}/>} {aba==='rotina'&&<RotinaMarketing {...props}/>}</div>;
}
