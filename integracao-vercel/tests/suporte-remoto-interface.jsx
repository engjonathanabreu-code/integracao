import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import SuporteRemoto,{useAcessoSuporte} from '../src/SuporteRemoto.jsx';
import appSource from '../src/App.jsx?raw';
import guiaCSS from '../src/ui-guide.css?raw';
import '../src/index.css';
const appCSS=appSource.split('const CSS = `')[1]?.split('`;')[0]||'';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let sessao={owner:id(1),controller:new AbortController()};
const capturar=()=>({owner:sessao.owner,signal:sessao.controller.signal,conferir(){if(this.owner!==sessao.owner||this.signal.aborted)throw Error('Sessão mudou');}});
const flags={adiarCap:false,adiarLista:false,perderResposta:false,erroLista:false,desativado:false,capNegada:false};
let resolverCap,resolverLista;
const pedidos=new Map(JSON.parse(localStorage.getItem('suporte-fixture-servidor')||'[]'));
const estatisticas={posts:JSON.parse(localStorage.getItem('suporte-fixture-posts')||'[]'),writes:pedidos.size,cap:0,listas:0,cancelamentos:[]};
const dispositivos=()=>[
 {usuario_id:id(4),nome:'Colaborador de teste',instalacao_id:id(40),versao:'fixture-sync-1',protocolo:1,diagnostico_instalacao_id:id(140),ultimo_relato:new Date().toISOString(),ultimo_contato:new Date().toISOString(),resumo:[{modulo:'metas',estado:'confirmado_aguardando_leitura',codigo:'LEITURA_DIVERGENTE',quantidade:1}]},
 {usuario_id:id(5),nome:'Relato anterior',instalacao_id:id(50),versao:'fixture-antiga',protocolo:1,ultimo_relato:new Date(Date.now()-180000).toISOString(),ultimo_contato:new Date(Date.now()-180000).toISOString(),resumo:[]},
 {usuario_id:id(6),nome:'Sem relato',instalacao_id:id(60),versao:'fixture-1',protocolo:null,ultimo_contato:null,resumo:[]},
 {usuario_id:id(7),nome:'Relato sem executor',instalacao_id:id(80),versao:'fixture-legacy',protocolo:null,ultimo_contato:new Date().toISOString(),ultimo_relato:new Date().toISOString(),resumo:[]},
 {usuario_id:id(8),nome:'Worker sem relato de fila',instalacao_id:id(100),versao:'fixture-sync-1',protocolo:1,ultimo_contato:new Date().toISOString(),ultimo_relato:null,resumo:[]},
 {usuario_id:id(9),nome:'Worker com relato antigo',instalacao_id:id(110),versao:'fixture-sync-1',protocolo:1,ultimo_contato:new Date().toISOString(),ultimo_relato:new Date(Date.now()-600000).toISOString(),resumo:[{modulo:'metas',estado:'pendente_local',codigo:'SEM_ERRO',quantidade:2}]}
];
const dados=()=>({config:{habilitado:!flags.desativado,ttl_segundos:300,intervalo_segundos:60,lease_segundos:60,retencao_dias:90},dispositivos:dispositivos(),solicitacoes:[...pedidos.values(),{id:id(70),tipo:'reler_confirmacao',pedido:id(71),estado:'concluida',criado_em:new Date().toISOString(),expira_em:new Date().toISOString(),recibo_no_servidor:true,resultado:{codigo:'LEITURA_CONFIRMADA',recibo_no_servidor:false,payload:{cpf:'CPF-PRIVADO'},message:'MENSAGEM-PRIVADA',itens:[{id:id(71),pedido:id(71),estado:'confirmado',codigo:'SEM_ERRO',temRecibo:true,restricao:'fin_receb_clientes_dia_vencimento_check',espera:'dependencia',dependencias:[id(72)],original:{senha:'SEGREDO-ORIGINAL'}}]}},{id:id(73),tipo:'consultar_recibo',estado:'concluida',recibo_no_servidor:false,resultado:{codigo:'SEM_RECIBO',recibo_no_servidor:true,itens:[]}},{id:id(74),tipo:'diagnostico',estado:'concluida',resultado:{codigo:'DIAGNOSTICO',recibo_no_servidor:true,itens:[]}}],auditoria:[{id:id(90),solicitacao_id:id(70),evento:'concluida',em:new Date().toISOString(),details:'DETALHE-PRIVADO'}]});
const api={
 async capacidade(){estatisticas.cap++;const owner=sessao.owner;if(flags.adiarCap){flags.adiarCap=false;return new Promise(r=>{flags.capPendente=owner;resolverCap=()=>{flags.capPendente=null;r({operador:owner===id(1),habilitado:!flags.desativado});};});}return {operador:owner===id(1)&&!flags.capNegada,habilitado:!flags.desativado};},
 async listar(){estatisticas.listas++;if(sessao.owner!==id(1))throw Error('PROIBIDO-PRIVADO');if(flags.erroLista)throw Error('CPF-PRIVADO-ERRO');if(flags.erroLista403)throw Object.assign(Error('CPF-PRIVADO-ACESSO'),{status:403});const d=dados();if(flags.adiarLista){flags.adiarLista=false;return new Promise(r=>{flags.listaPendente=true;resolverLista=()=>{flags.listaPendente=false;r(d);};});}return d;},
 async solicitar(args){estatisticas.posts.push(structuredClone(args));localStorage.setItem('suporte-fixture-posts',JSON.stringify(estatisticas.posts));if(!pedidos.has(args.id)){estatisticas.writes++;pedidos.set(args.id,{...args,estado:'criada',criado_em:new Date().toISOString(),expira_em:new Date(Date.now()+300000).toISOString()});localStorage.setItem('suporte-fixture-servidor',JSON.stringify([...pedidos]));}if(flags.perderResposta){flags.perderResposta=false;throw Error('CPF-PRIVADO-RESPOSTA');}return pedidos.get(args.id);},
 async cancelar(id){estatisticas.cancelamentos.push(id);if(pedidos.has(id))pedidos.get(id).estado='cancelada';}
};
const usuarios={operador:{erpRef:id(1),nome:'Operador fixture',tipo:'Administrador',setor:'diretoria',ativo:true},admin:{erpRef:id(2),nome:'Jonathan David de Abreu',tipo:'Administrador',setor:'diretoria',ativo:true},diretor:{erpRef:id(3),nome:'Diretor fixture',tipo:'Diretor Técnico',setor:'diretoria',ativo:true},funcionario:{erpRef:id(4),nome:'Funcionário fixture',tipo:'Projetos',setor:'projetos',ativo:true}};
let trocar,abrir,forcar;
function App(){
 const [usuario,setUsuario]=useState(usuarios.operador),[aba,setAba]=useState('suporteRemoto'),[v,setV]=useState(0);
 trocar=tipo=>{sessao.controller.abort();sessao={owner:usuarios[tipo].erpRef,controller:new AbortController()};setUsuario(usuarios[tipo]);};abrir=setAba;forcar=()=>setV(v=>v+1);
 const acesso=useAcessoSuporte(usuario,{api,capturar});
 return <main className="rb" data-ui-guide data-render={v} style={{padding:16}}><style>{appCSS}{guiaCSS}</style><div className="cabeca"><h1>Configurações</h1></div><nav className="abas" aria-label="Configurações" role="tablist"><button className="aba" aria-selected={aba==='temas'} role="tab" onClick={()=>setAba('temas')}>Temas</button>{acesso.operador&&<button className="aba" aria-selected={aba==='suporteRemoto'} role="tab" onClick={()=>setAba('suporteRemoto')}>Suporte remoto</button>}</nav>{aba==='suporteRemoto'?<SuporteRemoto usuario={usuario} acesso={acesso} api={api}/>:<p>Temas preservados</p>}</main>;
}
window.suporteFixture={flags,estatisticas,pedidos,trocar:tipo=>trocar(tipo),abrir:aba=>abrir(aba),forcar:()=>forcar(),resolverCap:()=>resolverCap?.(),resolverLista:()=>resolverLista?.(),id};
createRoot(document.getElementById('root')).render(<App/>);
