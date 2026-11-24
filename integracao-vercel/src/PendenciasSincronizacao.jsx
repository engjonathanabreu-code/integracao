import {diagnosticoOperacao} from './diagnostico-sincronizacao.js';
import {useState} from 'react';
import RevisaoConcorrencia from './RevisaoConcorrencia.jsx';
import {orientacaoPendencia,revisaoDeRecusa,classificarFalha,falhaPreparacaoSemEnvio,requerRevisaoFila} from './estado-sincronizacao.js';
// motivoEspera (C5) may live in either module; until it exists the local
// dependency walk below keeps the grouping by root cause.
import * as estadoSync from './estado-sincronizacao.js';
import * as filaSync from './fila-intencoes.js';
const estados={persistencia_falhou:'Ainda não guardada — exporte antes de sair',legado_revisao:'Original preservado para revisão',pendente_local:'Guardada no aparelho',resultado_desconhecido:'Resultado desconhecido',confirmado_aguardando_leitura:'Confirmada; aguardando leitura',bloqueado_conflito:'Valores diferentes — revisar',bloqueado_validacao:'Campos ou vínculos — revisar',falha_transitoria:'Aguardando nova tentativa'};
const motivos={RESPONSAVEL_INDISPONIVEL:'O responsável escolhido não está ativo no cadastro atual.',IDENTIDADE_OUTRA_META:'Um item pertence a outra meta. Preserve o histórico.',23503:'Uma referência está indisponível.',ARQUIVO_LOCAL_AUSENTE:'O arquivo original não está disponível neste aparelho.'};
const rotulo=i=>{if(falhaPreparacaoSemEnvio(i))return 'Falhou antes de enviar';const categoria=i.erro?.categoria||classificarFalha({status:i.erro?.status,code:i.erro?.codigo}).categoria;return categoria==='sessao'?'Sessão expirada — autenticar novamente':categoria==='permissao'?'Permissão insuficiente — solicitar revisão':estados[i.estado]||i.estado;};
const categoriaDe=i=>i.erro?.categoria||classificarFalha({status:i.erro?.status,code:i.erro?.codigo}).categoria;
const ativa=i=>!!i&&!['confirmado','substituido','dispensado'].includes(i.estado);
// Transient failures keep retrying on their own; from 8 failures on they are
// shown as late, never as something the user must review.
const atrasada=i=>!!i.erro&&(i.falhas||0)>=8&&categoriaDe(i)==='transitoria'&&!requerRevisaoFila(i);
const registroIndisponivel=i=>categoriaDe(i)==='registro_indisponivel';
function tituloPendencia(i){
 const e=(i?.original?.intencao?.edicoes||[]).find(e=>e.colecao!=='auditoria'),v=[e?.depois?.valor,e?.antes?.valor].find(x=>x&&typeof x==='object')||{};
 const t=v.titulo||v.nome||v.codigo||v.requerente?.nome;
 return t?`${i.original.modulo} “${String(t).slice(0,60)}”`:`${i?.original?.modulo||'alteração'} ${String(i?.id||'').slice(0,8)}`;
}
// Root cause = the first active prerequisite reached by following dependencies.
function causaRaiz(i,itens){
 const porId=new Map(itens.map(x=>[x.id,x])),deps=x=>x?.dependencias||x?.original?.dependencias||[],vistos=new Set([i.id]);
 let atual=i;
 for(;;){
  const dep=deps(atual).map(id=>porId.get(id)).find(d=>ativa(d)&&!vistos.has(d.id));
  if(!dep)break;vistos.add(dep.id);atual=dep;
 }
 if(atual!==i)return atual;
 const f=[estadoSync.motivoEspera,filaSync.motivoEspera].find(x=>typeof x==='function');
 let m=null;try{m=f?f(i,itens):null;}catch{m=null;}
 const alvo=m?.itemId&&porId.get(m.itemId);
 return alvo&&alvo!==i&&ativa(alvo)?alvo:null;
}
function agruparPorCausa(itens){
 const grupos=new Map();
 for(const i of itens){const raiz=causaRaiz(i,itens)||i;if(!grupos.has(raiz.id))grupos.set(raiz.id,{raiz,dependentes:[]});if(raiz!==i)grupos.get(raiz.id).dependentes.push(i);}
 // A root that is itself listed keeps its position; a missing one is shown by its dependents.
 return [...grupos.values()].map(g=>({...g,listada:itens.includes(g.raiz)}));
}
const valor=v=>v===undefined?'Não disponível nesta leitura':v===null?'Ausente':typeof v==='object'?JSON.stringify(v,null,2):String(v);
export default function PendenciasSincronizacao({sync}){
 const [ocupado,setOcupado]=useState(false);
 const p=sync.previaPendencia&&sync.pendencias?.some(i=>i.id===sync.previaPendencia.id)?sync.previaPendencia:null;
 const executar=async fn=>{if(ocupado)return;setOcupado(true);try{await fn();}finally{setOcupado(false);}};
 const item=(i,raiz=null)=>{
  const atraso=atrasada(i),indisponivel=registroIndisponivel(i);
  return <>{i.original.modulo} · {raiz?`aguardando ${tituloPendencia(raiz)}`:atraso?'atrasado (tentando novamente automaticamente)':indisponivel?'Registro indisponível — recriar ou descartar':rotulo(i)} · tentativa {i.tentativas}{motivos[i.erro?.codigo]&&<span> · {motivos[i.erro.codigo]}</span>}
   <p>{raiz?'Esta alteração será enviada depois que a anterior for concluída. Ela continua guardada neste aparelho.':atraso?'A conexão com o servidor está instável. As tentativas continuam automaticamente; nenhuma ação é necessária.':indisponivel?'O registro foi apagado ou ficou sem permissão para esta conta. Na revisão você pode descartar esta alteração; para recriá-lo, cadastre o registro novamente. O original continua preservado.':orientacaoPendencia(i)}</p>
   <details><summary>Diagnóstico desta alteração</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(sync.diagnosticarPendencia?.(i.id)||diagnosticoOperacao(i),null,2)}</pre><p>A propagação para outros aparelhos exige observação na outra sessão.</p></details>
   {!atraso&&<button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(()=>sync.abrirPendencia(i.id))}>Revisar esta alteração</button>}</>;
 };
 if(!sync.pendencias?.length&&!p&&!sync.falhasAtualizacao?.length)return null;
 return <section style={{padding:'8px 18px'}} aria-label="Sincronização de alterações">
  {sync.pendencias?.some(requerRevisaoFila)&&!sync.erroGlobal&&<div className="topo-acoes" aria-label="Ações da fila">
   <button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(sync.flush)}>Retomar tentativas automáticas</button>
   <button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(sync.reopen)}>Baixar cópia completa de recuperação</button>
  </div>}
  <details><summary>Pendências de sincronização ({(sync.pendencias||[]).length})</summary>
  {sync.falhasAtualizacao?.length>0&&<p role="status">{sync.falhasAtualizacao.length} ficha(s) aguardam atualização. As demais foram atualizadas; o conteúdo anterior e as pendências dessas fichas continuam preservados.</p>}
  <p>As alterações permanecem neste aparelho. Itens bloqueados podem ser revisados individualmente.</p>
  {sync.pendencias?.length>0&&sync.exportarSomentePendencias&&<><button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(sync.exportarSomentePendencias)}>Baixar somente pendências</button>
   <p>Este arquivo local inclui apenas mudanças em aberto e referências dos arquivos pendentes, sem fotos, documentos ou dados de contexto. Para resgatar o contexto e os anexos, use a cópia completa de recuperação separada.</p></>}

  <ul>{agruparPorCausa(sync.pendencias||[]).map(({raiz,dependentes,listada})=><li key={raiz.id}>{listada?item(raiz):<span>{tituloPendencia(raiz)}</span>}
   {dependentes.length>0&&<ul aria-label={`Aguardando ${tituloPendencia(raiz)}`}>{dependentes.map(i=><li key={i.id}>{item(i,raiz)}</li>)}</ul>}</li>)}</ul>
  {p&&<section aria-label="Prévia da recuperação"><strong>Revisão: {p.item.original.modulo}</strong>
   <p>Pedido {p.id.slice(0,8)}. {orientacaoPendencia(p.item)}</p>
   {p.somenteExportar?<p>{p.item.motivo}<button className="btn btn-sm" onClick={sync.reopen}>Baixar original preservado</button></p>:<>
    {p.leitura&&(p.leitura.campos.length>0||p.leitura.arquivos.length>0)?<section aria-label="Revisar leitura após recibo" style={{overflowWrap:'anywhere'}}>
     <p>A gravação tem recibo, mas estes valores não aparecem na leitura atual. Reconhecer essa leitura não reenvia a alteração. O conteúdo original continuará no histórico local, disponível para exportação.</p>
     {p.leitura.campos.map((c,n)=><details key={n}><summary>{c.caminho.join(' / ')}</summary><p>Base original: {valor(c.base)}</p><p>Alteração enviada: {valor(c.local)}</p><p>Valor atual compartilhado: {valor(c.remoto)}</p></details>)}
     {p.leitura.arquivos.map(a=><details key={a.id}><summary>Arquivo: {a.chave}</summary><p>Metadados enviados: {valor(a.esperado)}</p><p>Metadados atuais: {valor(a.atual)}</p></details>)}
     <button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(()=>sync.resolverPendencia({}))}>Repetir somente a leitura</button>
     <button className="btn btn-sm" disabled={ocupado} onClick={()=>{if(window.confirm('Reconhecer os valores e arquivos atuais desta prévia sem reenviar a alteração? O pedido e o conteúdo original continuarão arquivados neste aparelho.'))executar(sync.reconhecerPendencia);}}>Reconhecer valores atuais sem reenviar</button>
    </section>:p.conflitos.length&&!(p.item.estado.startsWith('bloqueado')&&!revisaoDeRecusa(p.item)&&!p.item.recibo)?<RevisaoConcorrencia key={p.id} conflitos={p.conflitos} dados={p.dados} resolver={escolhas=>executar(()=>sync.resolverPendencia(escolhas))}/>:<><details><summary>Ver alterações preservadas</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:300,overflow:'auto'}}>{JSON.stringify(p.edicoes,null,2)}</pre></details><button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(()=>sync.resolverPendencia({}))}>Confirmar retomada deste item</button></>}
    {revisaoDeRecusa(p.item)&&!p.item.recibo&&<button className="btn btn-sm" disabled={ocupado} onClick={()=>{if(window.confirm('Descartar somente esta alteração recusada e manter os valores compartilhados? O original ficará arquivado no histórico local.'))executar(sync.descartarPendencia);}}>Descartar esta alteração sem aplicar</button>}
   </>}
   <button className="btn btn-sm" disabled={ocupado} onClick={sync.fecharPrevia}>Fechar prévia</button>
  </section>}
 </details></section>;
}
