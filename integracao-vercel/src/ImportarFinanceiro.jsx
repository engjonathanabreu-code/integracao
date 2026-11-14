import {useState} from 'react';
import {lerTabela} from './dados-compartilhados.js';
import {rpcCRM} from './crm-api.js';
import {conciliarFinanceiro,dinheiro,dataFinanceira} from './financeiro-regras.js';
import {lerDocumentoFinanceiro,argumentosRelatorio} from './financeiro-importacao.js';
export default function ImportarFinanceiro({modo,cliente,fechar,salvo}){
 const [arquivo,setArquivo]=useState(null),[propostas,setPropostas]=useState(null),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState('');
 const [previa,setPrevia]=useState(null),[resultado,setResultado]=useState(null);
 const aptas=(previa?.dados?.linhas||[]).filter(linha=>['confirmavel','parcial_confirmavel'].includes(linha.situacao));
 const analisarPagamentos=async()=>{
  if(!arquivo)return;
  setOcupado(true);setErro('');setPrevia(null);setResultado(null);
  try{
   const entradas=await lerDocumentoFinanceiro(arquivo,'pagamentos');
   if(!entradas.length||entradas.length>500)throw Error('Use um relatório com 1 a 500 registros reconhecíveis.');
   const args=await argumentosRelatorio(arquivo,entradas);
   const dados=await rpcCRM('financeiro_baixa_relatorio',args);
   setPrevia({args,dados,entradas,arquivo});
  }catch(e){setErro(e.message);}finally{setOcupado(false);}
 };
 const confirmarPagamentos=async()=>{
  if(!aptas.length||ocupado||previa.arquivo!==arquivo)return;
  if(!confirm('Confirma os valores conferidos nesta prévia? Descontos e divergências seguem para revisão.'))return;
  setOcupado(true);setErro('');
  try{
   const resposta=await rpcCRM('financeiro_baixa_relatorio',{...previa.args,p_revisao:previa.dados.revisao});
   setResultado(resposta.repetido?'Este arquivo já foi confirmado.':'Confirmação registrada.');
   setPrevia(null);
  }catch(e){setErro(e.message+' Confira o histórico. Em caso de divergência, gere outra prévia.');}
  finally{setOcupado(false);}
 };
 const selecionadas=(propostas||[]).filter(p=>p.selecionado&&!p.motivo);
 const analisar=async()=>{if(!arquivo)return;setErro('');setOcupado(true);setPropostas(null);try{const entradas=await lerDocumentoFinanceiro(arquivo,modo);if(!entradas.length)throw Error('Nenhum registro reconhecido. Confira a legibilidade do documento.');if(entradas.length>500)throw Error('Divida o relatório em arquivos de até 500 registros.');const filtro=cliente?`&id=eq.${cliente.id}`:'&ativo=eq.true';const [cs,ps]=await Promise.all([lerTabela('fin_receb_clientes','id,nome,codigo,cpf_cnpj',filtro),lerTabela('fin_receb_parcelas','*',cliente?`&cliente_id=eq.${cliente.id}&ativo=eq.true`:'&ativo=eq.true')]);setPropostas(conciliarFinanceiro(entradas,cs,ps,modo));}catch(e){setErro(e.message);}finally{setOcupado(false);}};
 const confirmar=async()=>{if(!selecionadas.length||ocupado)return;setOcupado(true);setErro('');try{await rpcCRM('integracao_financeiro_importar',{p_arquivo:arquivo.name,p_itens:selecionadas.map(p=>({id:p.parcela.id,versao:p.parcela.versao,anterior:p.parcela,dados:p.dados}))});salvo();}catch(e){setErro(`${e.message}. O arquivo e a conferência permanecem nesta tela. Se houve conflito, analise novamente antes de confirmar.`);}finally{setOcupado(false);}};
 if(modo==='pagamentos')return <section className="card fin-importacao" aria-label="Conferir importação financeira">
  <h2>Relatório de pagamentos</h2>
  <p>Selecione um PDF, CSV ou Excel e confira os resultados antes de confirmar.</p>
  <input type="file" aria-label="Documento financeiro" accept=".pdf,.csv,.xlsx,.xls" disabled={ocupado} onChange={e=>{setArquivo(e.target.files[0]);setPrevia(null);setResultado(null);setErro('');}}/>
  <div className="fin-acoes"><button className="btn" disabled={!arquivo||ocupado} onClick={analisarPagamentos}>Analisar e conferir</button><button className="btn" disabled={ocupado} onClick={resultado?salvo:fechar}>Fechar</button></div>
  {erro&&<p role="alert">{erro}</p>}{resultado&&<p role="status">{resultado}</p>}
  {previa&&(previa.dados.repetido?<p role="status">Este arquivo já foi confirmado.</p>:<>
   <div className="rolagem"><table className="tab"><thead><tr><th>Pagador</th><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Conferência</th></tr></thead><tbody>
    {previa.dados.linhas.map(l=><tr key={l.linha}><td>{previa.entradas[l.linha-1]?.pagador}</td><td>{l.numero??'—'}</td><td>{dataFinanceira(l.vencimento)}</td><td>{l.valor==null?'—':dinheiro(l.valor)}</td><td>{rotuloPagamento(l.situacao)}</td></tr>)}
   </tbody></table></div>
   <button className="btn btn-primario" disabled={!aptas.length||ocupado} onClick={confirmarPagamentos}>Confirmar {aptas.length} pagamento(s)</button>
  </>)}
 </section>;
 return <section className="card fin-importacao" aria-label="Conferir importação financeira"><h2>{modo==='boletos'?'Boletos e carnês':'Relatório de pagamentos'}</h2><p>Confira cada cliente e vencimento antes de confirmar. Linhas ambíguas ou inválidas não serão gravadas.</p><p className="ajuda">PDF até 3 MB{modo==='pagamentos'?' ou CSV/Excel com nome, código/CPF, vencimento, valor_pago e data_pagamento':''}. Documentos PDF serão lidos pela IA.</p><input type="file" aria-label="Documento financeiro" accept={modo==='pagamentos'?'.pdf,.csv,.xlsx,.xls':'.pdf'} disabled={ocupado} onChange={e=>{setArquivo(e.target.files[0]);setPropostas(null);}}/><div className="fin-acoes"><button className="btn" disabled={!arquivo||ocupado} onClick={analisar}>{ocupado?'Processando…':'Analisar e conferir'}</button><button className="btn" disabled={ocupado} onClick={fechar}>Fechar</button></div>{erro&&<p role="alert">{erro}</p>}
 {propostas&&<><div className="rolagem"><table className="tab"><thead><tr><th>Confirmar</th><th>Cliente</th><th>Vencimento</th><th>{modo==='boletos'?'Linha digitável':'Valor pago'}</th><th>Conferência</th></tr></thead><tbody>{propostas.map((p,i)=><tr key={i}><td><input type="checkbox" aria-label={`Confirmar registro ${i+1}`} disabled={!!p.motivo||ocupado} checked={p.selecionado} onChange={e=>setPropostas(ps=>ps.map((a,n)=>n===i?{...a,selecionado:e.target.checked}:a))}/></td><td>{p.cliente?.nome||p.entrada.pagador}<small>{p.cliente?.codigo}</small></td><td>{dataFinanceira(p.entrada.vencimento)}</td><td className="fin-codigo">{modo==='boletos'?p.entrada.linha_digitavel:dinheiro(p.entrada.valor_liquidado)}</td><td>{p.motivo||`Parcela ${p.parcela.numero} encontrada — conferir`}</td></tr>)}</tbody></table></div><button className="btn btn-primario" disabled={!selecionadas.length||ocupado} onClick={confirmar}>Confirmar {selecionadas.length} {modo==='boletos'?'código(s)':'pagamento(s)'}</button></>}
 </section>;
}

function rotuloPagamento(situacao){
 return ({
  confirmavel:'Pagamento integral',parcial_confirmavel:'Pagamento parcial',registrado:'Já registrado',retorno_ailos:'Use o retorno Ailos',
  dados_invalidos:'Data ou valor inválido',sem_titulo:'Título sem correspondência',ambiguo:'Correspondência ambígua',linhas_repetidas:'Título repetido no arquivo',
  desconto_revisao:'Desconto para revisão',valor_divergente:'Valor divergente',situacao_divergente:'Parcela já movimentada ou indisponível'
 })[situacao]||'Revisão necessária';
}
