import {useState} from 'react';
const valor=x=>x===undefined?'Item removido':x===null?'Não informado':typeof x==='boolean'?(x?'Sim':'Não'):typeof x==='object'?(Array.isArray(x)?x.map(valor).join('; '):Object.entries(x).filter(([k])=>k!=='id').map(([k,v])=>`${k}: ${valor(v)}`).join('; ')):String(x);
const nomes={processos:'Morador',metas:'Meta',nucleos:'Núcleo',municipios:'Município',planos:'Plano',ordensServico:'Ordem de serviço',etapa:'Etapa',titulo:'Título',concluido:'Concluído',status:'Situação',observacoes:'Observações',nome:'Nome',contato:'Contato',produto:'Produto',valor:'Valor',valor_total:'Valor total',juros:'Juros',multa:'Multa',vencimento:'Vencimento',valor_previsto:'Valor base',valor_liquidado:'Valor pago',pago_em:'Data do pagamento'};
function rotulo(c,dados){
 let atual=dados,titulo='';
 for(const k of c.caminho){atual=Array.isArray(atual)?atual.find(x=>x.id===k):atual?.[k];if(atual&&typeof atual==='object'&&!Array.isArray(atual))titulo=atual.titulo||atual.requerente?.nome||atual.nome||atual.codigo||titulo;}
 const campo=c.caminho.at(-1),nome=/^[0-9a-f-]{36}$/i.test(campo)?'Item':nomes[campo]||campo.replaceAll('_',' ');
 return titulo?`${titulo} — ${nome}`:nome;
}
export default function RevisaoConcorrencia({conflitos,resolver,dados}){
 const [escolhas,setEscolhas]=useState({}),[ocupado,setOcupado]=useState(false);
 return <section aria-label="Revisar alterações simultâneas" style={{padding:16,background:'var(--card)',color:'var(--text)'}}>
  <strong>Revisar alterações simultâneas</strong><p>As alterações compatíveis serão mantidas. Escolha apenas os valores que ficaram diferentes.</p>
  {conflitos.map(c=><fieldset key={c.chave} disabled={ocupado} style={{marginBottom:12}}><legend>{rotulo(c,dados)}</legend>
   {[['local','Sua alteração',c.local],['remoto','Valor atual compartilhado',c.remoto]].map(([opcao,nome,v])=><label key={opcao} style={{display:'block',overflowWrap:'anywhere'}}><input type="radio" name={c.chave} checked={escolhas[c.chave]===opcao} onChange={()=>setEscolhas(x=>({...x,[c.chave]:opcao}))}/>{nome}: {valor(v)}</label>)}
  </fieldset>)}
  <button className="btn btn-sm" disabled={ocupado||conflitos.some(c=>!escolhas[c.chave])} onClick={async()=>{setOcupado(true);try{await resolver(escolhas);}finally{setOcupado(false);setEscolhas({});}}}>{ocupado?'Salvando…':'Salvar escolhas e continuar'}</button>
 </section>;
}
