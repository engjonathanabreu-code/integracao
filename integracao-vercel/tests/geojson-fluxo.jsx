import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Importador from '../geojson/ImportadorGeoJSON.jsx';
function Teste(){const [db,setDb]=useState({nucleos:[{id:'n',etapa:1}],processos:[{id:'p',nucleoId:'n',situacao:'Ativo',codigo:'TST01_001',requerente:{nome:'Morador teste'},unidades:[{id:'u',caracteristicas:'Preservar'}]}]});const [toast,setToast]=useState('');
return <><Importador db={db} n={db.nucleos[0]} perm={{etapa:()=>true}} mutar={fn=>setDb(d=>fn(structuredClone(d)))} por="Revisor teste" setToast={setToast} onVer={()=>{}}/><p role="status">{toast}</p><output id="resultado">{JSON.stringify(db)}</output></>}
createRoot(document.getElementById('root')).render(<Teste/>);
