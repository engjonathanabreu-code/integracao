import {useState} from 'react';
import {Power,RefreshCw} from 'lucide-react';
import {rpcCRM} from './crm-api.js';
import {useModulo,EstadoModulo} from './modulo-ui.jsx';
import {administradorDocumental,idPastaDocumental} from './documental-config-regras.js';
export {administradorDocumental} from './documental-config-regras.js';

export default function DocumentalChatwootConfig({usuario}){
 const permitido=administradorDocumental(usuario),[cliente,setCliente]=useState(''),[pasta,setPasta]=useState(''),[aviso,setAviso]=useState('');
 const m=useModulo(()=>permitido?rpcCRM('integracao_documental_ler',{}):Promise.resolve(null),[usuario.id,permitido]);
 if(!permitido)return <p>Apenas administradores podem configurar este fluxo.</p>;
 const d=m.dados;
 const fresco=d?.checado_em&&Date.now()-Date.parse(d.checado_em)<20*60*1000;
 const ligarPossivel=d?.pronto&&fresco&&d.pastas>0;
 const alternar=async()=>{setAviso('');if(await m.executar(()=>rpcCRM('integracao_documental_alternar',{p_ativo:!d.ativo,p_versao:d.versao})))setAviso(d.ativo?'Fluxo documental desligado.':'Fluxo documental ligado para os clientes vinculados de Guaratuba.');};
 const vincular=async e=>{e.preventDefault();setAviso('');const id=idPastaDocumental(pasta);if(!id){setAviso('Informe o link da pasta específica do cliente no Google Drive.');return;}if(await m.executar(()=>rpcCRM('integracao_documental_vincular',{p_cliente:cliente,p_pasta:id}))){setPasta('');setAviso('Pasta vinculada. O agente verificará o acesso antes de usá-la.');}};
 return <section className="card" style={{padding:20}}><h2>Coleta de documentos — Guaratuba</h2><p>O assistente confere as pendências, conversa pelo Chatwoot e guarda os documentos na pasta do cliente.</p><EstadoModulo modulo={m}/>{aviso&&<p role="status">{aviso}</p>}{d&&<><div className="flex flex-wrap items-center gap-3" style={{margin:'18px 0'}}><strong role="status">{d.ativo?'Ligado':'Desligado'}</strong><button className={`btn ${d.ativo?'btn-perigo':'btn-primario'}`} disabled={m.ocupado||(!d.ativo&&!ligarPossivel)} onClick={alternar}><Power size={16}/>{m.ocupado?'Salvando…':d.ativo?'Desligar fluxo':'Ligar fluxo'}</button><button className="btn btn-sm" disabled={m.ocupado} onClick={m.atualizar}><RefreshCw size={14}/>Atualizar</button></div><p className="ajuda">Desligar interrompe as próximas ações documentais. Arquivos e histórico são preservados. Os demais atendimentos continuam com suas regras atuais.</p><p>{d.pronto&&fresco?'Google Drive conectado e verificado.':'Google Drive aguardando conexão ou verificação no servidor.'} {d.pastas} cliente(s) com pasta vinculada.</p><form onSubmit={vincular} style={{display:'grid',gap:10,maxWidth:650,marginTop:20}}><h3>Pasta de cada cliente</h3><label>Cliente de Guaratuba<select className="inp" value={cliente} onChange={e=>setCliente(e.target.value)} required><option value="">Selecione o cliente</option>{(d.clientes||[]).map(c=><option key={c.id} value={c.id}>{c.codigo} — {c.nome}{c.pasta_id?' · pasta vinculada':''}</option>)}</select></label><label>Pasta do cliente no Google Drive<input className="inp" type="url" value={pasta} onChange={e=>setPasta(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" required/></label><small>Selecione a subpasta do cliente dentro da pasta Guaratuba. O agente usa apenas conversas com identidade e cadastro confirmados.</small><button className="btn" disabled={m.ocupado||!cliente||!idPastaDocumental(pasta)}>Vincular pasta</button></form></>}</section>;
}
