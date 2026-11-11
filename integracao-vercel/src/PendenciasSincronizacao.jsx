import {useState} from 'react';
import RevisaoConcorrencia from './RevisaoConcorrencia.jsx';
import {orientacaoPendencia,revisaoDeRecusa,classificarFalha} from './estado-sincronizacao.js';
const estados={persistencia_falhou:'Ainda não guardada — exporte antes de sair',legado_revisao:'Original preservado para revisão',pendente_local:'Guardada no aparelho',resultado_desconhecido:'Resultado desconhecido',confirmado_aguardando_leitura:'Confirmada; aguardando leitura',bloqueado_conflito:'Valores diferentes — revisar',bloqueado_validacao:'Campos ou vínculos — revisar',falha_transitoria:'Aguardando nova tentativa'};
const motivos={RESPONSAVEL_INDISPONIVEL:'O responsável escolhido não está ativo no cadastro atual.',IDENTIDADE_OUTRA_META:'Um item pertence a outra meta. Preserve o histórico.',23503:'Uma referência está indisponível.',ARQUIVO_LOCAL_AUSENTE:'O arquivo original não está disponível neste aparelho.'};
const rotulo=i=>{const categoria=i.erro?.categoria||classificarFalha({status:i.erro?.status,code:i.erro?.codigo}).categoria;return categoria==='sessao'?'Sessão expirada — autenticar novamente':categoria==='permissao'?'Permissão insuficiente — solicitar revisão':estados[i.estado]||i.estado;};
export default function PendenciasSincronizacao({sync}){
 const p=sync.previaPendencia,[ocupado,setOcupado]=useState(false);
 const executar=async fn=>{if(ocupado)return;setOcupado(true);try{await fn();}finally{setOcupado(false);}};
 if(!sync.pendencias?.length&&!p)return null;
 return <details style={{padding:'8px 18px'}}><summary>Pendências de sincronização ({sync.pendencias.length})</summary>
  <p>As alterações permanecem neste aparelho. O botão geral retoma somente tentativas automáticas; itens bloqueados exigem revisão individual.</p>
  <ul>{sync.pendencias.map(i=><li key={i.id}>{i.original.modulo} · {rotulo(i)} · tentativa {i.tentativas}{motivos[i.erro?.codigo]&&<span> · {motivos[i.erro.codigo]}</span>}<p>{orientacaoPendencia(i)}</p><button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(()=>sync.abrirPendencia(i.id))}>Revisar esta alteração</button></li>)}</ul>
  {p&&<section aria-label="Prévia da recuperação"><strong>Revisão: {p.item.original.modulo}</strong>
   <p>Pedido {p.id.slice(0,8)}. {orientacaoPendencia(p.item)}</p>
   {p.somenteExportar?<p>{p.item.motivo}<button className="btn btn-sm" onClick={sync.reopen}>Baixar original preservado</button></p>:<>
    {p.conflitos.length&&!(p.item.estado.startsWith('bloqueado')&&!revisaoDeRecusa(p.item)&&!p.item.recibo)?<RevisaoConcorrencia key={p.id} conflitos={p.conflitos} dados={p.dados} resolver={escolhas=>executar(()=>sync.resolverPendencia(escolhas))}/>:<><details><summary>Ver alterações preservadas</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:300,overflow:'auto'}}>{JSON.stringify(p.edicoes,null,2)}</pre></details><button className="btn btn-sm" disabled={ocupado} onClick={()=>executar(()=>sync.resolverPendencia({}))}>Confirmar retomada deste item</button></>}
    {revisaoDeRecusa(p.item)&&!p.item.recibo&&<button className="btn btn-sm" disabled={ocupado} onClick={()=>{if(window.confirm('Descartar somente esta alteração recusada e manter os valores compartilhados? O original ficará arquivado no histórico local.'))executar(sync.descartarPendencia);}}>Descartar esta alteração sem aplicar</button>}
   </>}
   <button className="btn btn-sm" disabled={ocupado} onClick={sync.fecharPrevia}>Fechar prévia</button>
  </section>}
 </details>;
}
