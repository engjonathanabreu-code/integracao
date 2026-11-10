import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {useModulo} from '../src/modulo-ui.jsx';
const pending={};window.moduloTeste={pending,callbacks:[]};
function App(){const [id,setId]=useState('A'),m=useModulo(async()=>({id}),[id]);Object.assign(window.moduloTeste,{id,m,setId});return <><div>{id}</div><button onClick={()=>m.executar(()=>new Promise((resolve,reject)=>{pending[id]={resolve,reject};}),()=>window.moduloTeste.callbacks.push(id))}>Salvar</button><output>{m.ocupado?'ocupado':'livre'}</output></>;}
createRoot(document.getElementById('root')).render(<App/>);
