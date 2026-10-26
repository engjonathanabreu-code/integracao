import {useRef,useState} from 'react';
import {CampoCRM,EstadoModulo,useModulo} from './modulo-ui.jsx';
import {idPonto} from './ponto-api.js';
import {dadosNovaVersao} from './oficios-versoes.js';
import {prepararOficio,enviarOficio,atualizarOficio,historicoOficio,abrirOficio,analisarOficio} from './oficios-api.js';

export function AtualizacaoOficio({oficio,usuario,fechar,salvo}){
 const chave=`integracao-oficio-versao-pendente:${idPonto(usuario)}:${oficio.id}`;
 const [pendente]=useState(()=>{try{const d=JSON.parse(localStorage.getItem(chave));return d?.oficio_id===oficio.id&&d.pedido!==oficio.versao_id?d:null;}catch{return null;}});
 const [form,setForm]=useState(()=>pendente||dadosNovaVersao(oficio,crypto.randomUUID()));
 const [erro,setErro]=useState(''),[aviso,setAviso]=useState(pendente?'Há um pedido sem confirmação. Repita o mesmo pedido para conferir o resultado.':''),[ocupado,setOcupado]=useState(false),[tentativa,setTentativa]=useState(pendente);
 const trava=useRef(false),bloqueado=ocupado||!!tentativa;
 const campo=(k,v)=>setForm(f=>({...f,[k]:v,...(k==='resumo'?{resumo_status:v?'revisado':'pendente'}:{})}));
 async function executar(fn){if(trava.current)return;trava.current=true;setOcupado(true);setErro('');try{await fn();}catch(e){setErro(e.message);}finally{trava.current=false;setOcupado(false);}}
 return <section className="card oficio-cadastro"><h3>Atualizar ofício · nova v{oficio.versao+1}</h3>
 <p>A versão anterior será preservada. Salvar não envia documentos à prefeitura. Esta versão ficará como Não enviado.</p>
 <form className="ponto-form" data-edicao-pendente="true" onSubmit={e=>{e.preventDefault();executar(async()=>{
  const dados=tentativa||form;
  localStorage.setItem(chave,JSON.stringify(dados));setTentativa(dados);
  try{await atualizarOficio(dados);}catch(e){
   // Erros SQL/validação comprovam rollback. Falha de transporte exige o mesmo pedido.
   if(e.status>=400&&e.status<500){localStorage.removeItem(chave);setTentativa(null);}
   throw e;
  }
  localStorage.removeItem(chave);salvo();
 });}}>
 <CampoCRM nome="Prefeitura / Município"><input className="inp" required minLength={2} maxLength={200} disabled={bloqueado} value={form.prefeitura} onChange={e=>campo('prefeitura',e.target.value)}/></CampoCRM>
 <CampoCRM nome="Assunto"><input className="inp" required minLength={3} maxLength={300} disabled={bloqueado} value={form.assunto} onChange={e=>campo('assunto',e.target.value)}/></CampoCRM>
 <CampoCRM nome="Resumo / novas informações"><textarea className="inp" rows={5} maxLength={2000} disabled={bloqueado} value={form.resumo} onChange={e=>campo('resumo',e.target.value)}/></CampoCRM>
 <p>Arquivo desta versão: <strong>{form.nome_arquivo}</strong>. Se mantido, o arquivo original continua vinculado a esta versão.</p>
 <CampoCRM nome="Novo arquivo (opcional)"><input className="inp" type="file" accept=".pdf,.docx,.txt" disabled={bloqueado} onChange={e=>{const arquivo=e.target.files?.[0];if(!arquivo)return;executar(async()=>{
  const meta=await prepararOficio(arquivo,idPonto(usuario),crypto.randomUUID());await enviarOficio(arquivo,meta);
  setForm(f=>({...f,...meta}));setAviso('Novo arquivo anexado. Confira as informações antes de salvar.');
 });}}/></CampoCRM>
 <small>PDF, DOCX ou TXT · até 10 MB. Cada novo arquivo usa um caminho exclusivo.</small>
 {aviso&&<p role="status">{aviso}</p>}{erro&&<p role="alert">{erro}</p>}
 {tentativa&&erro&&<p>Confira a lista ao fechar. “Tentar salvar novamente” repete o mesmo pedido sem criar outra versão. Para revisar após conflito, feche e reabra a atualização mais recente.</p>}
 <div className="flex flex-wrap gap-2"><button className="btn btn-primario" disabled={ocupado}>{ocupado?'Salvando…':tentativa?'Tentar salvar novamente':`Salvar v${oficio.versao+1}`}</button>
 <button className="btn" type="button" disabled={bloqueado} onClick={()=>executar(async()=>{const ia=await analisarOficio(form.caminho);setForm(f=>({...f,resumo:ia.resumo,resumo_status:'ia'}));setAviso('Resumo gerado por IA. Confira antes de salvar uma nova versão.');})}>Gerar resumo com IA</button>
 <button className="btn" type="button" disabled={ocupado} onClick={fechar}>Cancelar atualização</button></div>
 </form></section>;
}

export async function abrirArquivoVersao(caminho){
 const janela=window.open('about:blank','_blank');if(janela)janela.opener=null;
 try{const url=await abrirOficio(caminho);if(!janela)throw Error('Permita abrir uma nova aba para visualizar o arquivo.');janela.location=url;}catch(e){janela?.close();throw e;}
}
export function HistoricoOficio({oficio,fechar}){
 const m=useModulo(()=>historicoOficio(oficio.id),[oficio.id],['metas']),[selecionada,setSelecionada]=useState(null),[erro,setErro]=useState('');
 const versoes=m.dados||[],atual=versoes[0],v=versoes.find(v=>v.id===selecionada)||atual;
 return <section className="card oficio-cadastro oficio-historico" aria-label="Histórico do ofício"><h3>Histórico · {String(oficio.numero).padStart(3,'0')}/{oficio.ano}</h3>
 <EstadoModulo modulo={m}/>{v&&<><CampoCRM nome="Versão consultada"><select className="inp" value={v.id} onChange={e=>setSelecionada(e.target.value)}>{versoes.map(x=><option value={x.id} key={x.id}>v{x.versao}{x.id===atual.id?' · mais recente':''}</option>)}</select></CampoCRM>
 <h4>{v.assunto}</h4><p>{v.prefeitura} · {v.data_envio?`Enviado em ${v.data_envio.split('-').reverse().join('/')}`:'Não enviado'}</p>
 <p className="oficio-texto">{v.resumo||'Resumo ainda não gerado.'}</p>
 <p>Autor: {v.autor} · Criada em {new Date(v.criado_em).toLocaleString('pt-BR')}</p>
 <p>Arquivo: {v.nome_arquivo} · {v.tamanho} bytes</p>
 <button className="btn" onClick={async()=>{setErro('');try{await abrirArquivoVersao(v.caminho);}catch(e){setErro(e.message);}}}>Abrir arquivo da v{v.versao}</button></>}
 {erro&&<p role="alert">{erro}</p>}<button className="btn" onClick={fechar}>Fechar histórico</button></section>;
}
