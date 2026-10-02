import {useState} from 'react';
import {listarCRM} from './crm-api.js';
import {acessoCRM,normalizarCRM} from './crm-regras.js';
import {useModulo,EstadoModulo} from './modulo-ui.jsx';
import {followupsVencidos,dadosPedidoComercial,cardsDaCarteira,podeUsarAgenteComercial} from './agente-comercial-regras.js';
import {dataFollowup} from './crm-followup.js';
export default function AgenteComercial({usuario,db,onAcao,pedido='',selecionar=false}) {
 const [busca,setBusca]=useState('');
 const acesso=acessoCRM(usuario);
 const m=useModulo(async()=>{if(!podeUsarAgenteComercial(usuario))return {cards:[],followups:[]};const [cards,followups]=await Promise.all([listarCRM('integracao_crm_funil'),podeUsarAgenteComercial(usuario)?listarCRM('integracao_crm_followups','&status=eq.pendente'):Promise.resolve([])]);return {cards,followups}},[usuario.id,selecionar,pedido],['crm','clientes']);
 if(!podeUsarAgenteComercial(usuario))return null;
 const vencidos=followupsVencidos(m.dados?.cards||[],m.dados?.followups||[],usuario);
 const cards=cardsDaCarteira(m.dados?.cards||[],usuario).filter(c=>normalizarCRM(c.nome||c.lead_nome).includes(normalizarCRM(busca)));
 const abrir=(c,modo)=>onAcao({tipo:'CRM',id:c.id,modo,pedido,conteudo:dadosPedidoComercial(pedido).conteudo,ajustes:{telefone:dadosPedidoComercial(pedido).telefone,cpf:dadosPedidoComercial(pedido).cpf,nome:dadosPedidoComercial(pedido).nomeAlterado},nonce:crypto.randomUUID()});
 return <section className="card ap-commercial"><h3>{selecionar?'Preencher CRM':'Follow-ups vencidos'}{!selecionar&&<span className="pill">{vencidos.length}</span>}</h3><EstadoModulo modulo={m}/>{selecionar?<><p className="ajuda">Escolha o card. O pedido será levado ao formulário oficial para revisão.</p><input className="inp" aria-label="Buscar card para o agente" placeholder="Nome do lead ou cliente" value={busca} onChange={e=>setBusca(e.target.value)}/><div className="ap-commercial-list">{cards.slice(0,30).map(c=><button className="ap-commercial-item" key={c.id} onClick={()=>abrir(c,dadosPedidoComercial(pedido).modo||'editar')}><strong>{c.nome||c.lead_nome}</strong><span className="ajuda">{c.municipio||c.lead_cidade||'Município não informado'} · {c.status}</span></button>)}</div>{m.dados&&!cards.length&&<p className="ajuda">Nenhum card disponível para esta busca.</p>}</>:<><p className="ajuda">Priorize os contatos pendentes. Marque como feito somente após realizar o contato.</p><div className="ap-commercial-list">{vencidos.map(f=><button className="ap-commercial-item" key={f.id} onClick={()=>abrir(f.card,'followup')}><strong>{f.card.nome||f.card.lead_nome}</strong><span className="ajuda">Venceu em {dataFollowup(f.previsto_em)}</span><span>Registrar retorno →</span></button>)}</div>{m.dados&&!vencidos.length&&<p className="ajuda">Nenhum follow-up vencido na carteira disponível.</p>}<button className="btn btn-sm" onClick={m.atualizar}>Atualizar follow-ups</button></>}</section>;
}
