import RevisaoConcorrencia from './RevisaoConcorrencia.jsx';
const estados={persistencia_falhou:'Ainda não guardada — exporte antes de sair',legado_revisao:'Original preservado para revisão',pendente_local:'Guardada no aparelho',resultado_desconhecido:'Consultando confirmação',confirmado_aguardando_leitura:'Confirmada; aguardando leitura',bloqueado_conflito:'Valores diferentes — revisar',bloqueado_validacao:'Validação ou permissão — revisar',falha_transitoria:'Aguardando nova tentativa'};
const motivos={23503:'Confira os responsáveis e vínculos: uma referência está indisponível.',42501:'Sua conta não tem permissão para esta operação.',PT409:'O registro mudou ou sua identidade precisa de revisão.',ARQUIVO_LOCAL_AUSENTE:'O arquivo original não está disponível neste aparelho.',LEITURA_DIVERGENTE:'Há recibo, mas os valores atuais diferem da gravação.'};
export default function PendenciasSincronizacao({sync}){
 const p=sync.previaPendencia;
 if(!sync.pendencias?.length&&!p)return null;
 return <details style={{padding:'8px 18px'}}><summary>Pendências de sincronização ({sync.pendencias.length})</summary>
  <p>As alterações permanecem neste aparelho. Revise somente os itens desejados; os demais continuam preservados.</p>
  <ul>{sync.pendencias.map(i=><li key={i.id}>{i.original.modulo} · {estados[i.estado]||i.estado} · tentativa {i.tentativas}{motivos[i.erro?.codigo]&&<span> · {motivos[i.erro.codigo]}</span>}<button className="btn btn-sm" onClick={()=>sync.abrirPendencia(i.id)}>Revisar esta alteração</button></li>)}</ul>
  {p&&<section aria-label="Prévia da recuperação"><strong>Revisão: {p.item.original.modulo}</strong>
   <p>Pedido {p.id.slice(0,8)}. {p.item.recibo?'A gravação já tem recibo; será feita somente a releitura.':p.item.estado==='resultado_desconhecido'?'O resultado é desconhecido. A retomada consultará o recibo e manterá o mesmo pedido.':'Confira os valores e confirme somente esta alteração.'}</p>
   {p.somenteExportar?<p>{p.item.motivo}<button className="btn btn-sm" onClick={sync.reopen}>Baixar original preservado</button></p>:p.conflitos.length?<RevisaoConcorrencia conflitos={p.conflitos} dados={p.dados} resolver={sync.resolverPendencia}/>:<><details><summary>Ver alterações preservadas</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:300,overflow:'auto'}}>{JSON.stringify(p.edicoes,null,2)}</pre></details><button className="btn btn-sm" onClick={()=>sync.resolverPendencia({})}>Confirmar retomada deste item</button></>}
   <button className="btn btn-sm" onClick={sync.fecharPrevia}>Fechar prévia</button>
  </section>}
 </details>;
}
