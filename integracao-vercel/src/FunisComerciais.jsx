import {useEffect,useState} from 'react';
import {EstadoModulo,useModulo,CampoCRM} from './modulo-ui.jsx';
import {acessoCRM} from './crm-regras.js';
import {listarCRM,rpcCRM} from './crm-api.js';
import {idDaSessao} from './dados-compartilhados.js';
import {acaoDoFunil,apresentarFunis,idComercial} from './funis-comerciais.js';
import FunilInstitucional from './FunilInstitucional.jsx';

export default function FunisComerciais({db,usuario,institucionais,abrirInstitucional}) {
 const ator=idComercial(usuario),acesso=acessoCRM(usuario);
 const [filtro,setFiltro]=useState('todos'),[local,setLocal]=useState(null);
 useEffect(()=>{setFiltro('todos');setLocal(null)},[ator]);
 const m=useModulo(async()=>{
  if(idDaSessao()!==ator)throw new Error('O usuário mudou. Atualize a tela antes de continuar.');
  const [participantes,registros]=await Promise.all([listarCRM('integracao_funil_comerciais'),listarCRM('integracao_funis_institucionais')]);
  if(idDaSessao()!==ator)throw new Error('O usuário mudou. Atualize a tela antes de continuar.');
  return {ator,participantes,registros};
 },[ator],['crm']);
 if(!m.dados||m.dados.ator!==ator)return <><EstadoModulo modulo={m}/>{m.dados&&<p role="status">Carregando o fluxo do usuário…</p>}</>;
 const participantes=m.dados.participantes.map(p=>({...p,nome:db.usuarios.find(u=>idComercial(u)===p.id)?.nome||'Comercial cadastrado'}));
 const escolhidos=acesso.admin?(filtro==='todos'?participantes:participantes.filter(p=>p.id===filtro)):participantes.filter(p=>p.id===ator);
 if(!escolhidos.length)return <><EstadoModulo modulo={m}/><p className="ajuda">Seu usuário não está habilitado para um funil individual.</p></>;
 const registros=m.dados.registros.map(r=>local?.id===r.id&&local.revisao>r.revisao?local:r);
 if(local?.id===ator&&!registros.some(r=>r.id===local.id))registros.push(local);
 const consolidado=acesso.admin&&filtro==='todos';
 const fluxo=apresentarFunis(escolhidos,registros,{consolidado});
 const pode=!acesso.admin&&acesso.comercial&&escolhidos.some(p=>p.id===ator&&p.habilitado);
 const nome=consolidado?'Consolidado dos comerciais':escolhidos[0].nome;
 const registro=registros.find(r=>r.id===ator);
 const salvar=async acao=>{
  if(!pode||idDaSessao()!==ator)throw new Error('O usuário mudou ou não pode editar este fluxo.');
  let falha;
  const ok=await m.executar(async()=>{try{return await rpcCRM('integracao_funil_salvar',{p_revisao:registro?.revisao||0,p_acao:acaoDoFunil(acao),p_pedido:crypto.randomUUID()});}catch(e){falha=e;throw e}},resultado=>{
   if(idDaSessao()===ator)setLocal(anterior=>anterior?.id===ator&&anterior.revisao>resultado.revisao?anterior:resultado);
  });
  if(!ok)throw falha||new Error('Não foi possível salvar. Atualize antes de tentar novamente.');
 };
 const legado=acesso.admin&&db.funilInstitucional;
 return <>
  <EstadoModulo modulo={m}/>
  {acesso.admin&&<div className="crm-acoes fi-filtro"><CampoCRM nome="Visão do fluxo"><select className="inp" aria-label="Filtrar funil por comercial" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Consolidado ({participantes.length} comerciais)</option>{participantes.map(p=><option key={p.id} value={p.id}>{p.nome}{p.habilitado?'':' (desabilitado)'}</option>)}</select></CampoCRM><span className="ajuda">Visão administrativa de consulta. O limite de Prospecção é individual.</span></div>}
  <FunilInstitucional key={ator+':'+filtro} db={db} usuario={usuario} fluxoRecebido={fluxo} podeEditar={pode} onSalvarAcao={salvar} limiteProspecao={consolidado?escolhidos.length*4:4} consolidado={consolidado} titulo={`Fluxo institucional — ${nome}`} institucionais={institucionais} abrirInstitucional={abrirInstitucional}/>
  {legado&&(legado.cidades.length||legado.nucleos.length||legado.historico.length)>0&&<details className="card fi-legado"><summary>Legado sem responsável ({legado.cidades.length} município(s), {legado.nucleos.length} núcleo(s))</summary><p className="ajuda">Registros preservados em consulta administrativa, fora da soma dos funis individuais. Nenhum responsável foi atribuído.</p><FunilInstitucional db={db} usuario={usuario} fluxoRecebido={legado} podeEditar={false} titulo="Legado sem responsável" institucionais={institucionais} abrirInstitucional={abrirInstitucional}/></details>}
 </>;
}
