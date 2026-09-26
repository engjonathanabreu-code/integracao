import {useState} from 'react';
import {listarCRM,criarCRM} from './crm-api.js';
import {requisicao} from './dados-compartilhados.js';
import {useModulo,EstadoModulo} from './modulo-ui.jsx';
import {podeUsarAgentes} from './permissoes.js';
function Editor({agente,registro,ocupado,salvar}) {
 const [prompt,setPrompt]=useState(registro?.prompt||''),[ativa,setAtiva]=useState(registro?.ativa!==false);
 return <form className="crm-painel" onSubmit={e=>{e.preventDefault();salvar({agente,prompt:prompt.trim(),ativa},registro);}}><h3>{agente==='tecnico'?'Agente técnico — sugestões de metas':'Agente comercial'}</h3><label>Estratégia da Diretoria<textarea className="inp" rows={6} maxLength={6000} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={agente==='tecnico'?'Priorizar trabalhos parados em prefeituras há pelo menos dois meses. Sugerir contatos e ações para destravar os processos.':'Priorizar a conversão dos clientes em Contrato com prazo próximo.'}/></label><p className="ajuda">Informe prioridades, critérios e resultados esperados. O agente usa somente os dados disponíveis e mantém as regras de acesso. {prompt.length}/6000 caracteres.</p><label><input type="checkbox" checked={ativa} onChange={e=>setAtiva(e.target.checked)}/> Aplicar esta estratégia</label><div className="crm-acoes"><button className="btn btn-primario" disabled={ocupado}>Salvar estratégia</button></div>{registro&&<small>Atualizada em {new Date(registro.atualizado_em).toLocaleString('pt-BR')}</small>}</form>;
}
export default function EstrategiasAgentes({usuario}) {
 const permitido=podeUsarAgentes(usuario),[aviso,setAviso]=useState('');
 const m=useModulo(()=>permitido?listarCRM('integracao_agente_estrategias'):Promise.resolve([]),[usuario.id,permitido]);
 if(!permitido)return <p>Apenas a Diretoria pode configurar os agentes.</p>;
 const salvar=async(dados,anterior)=>{setAviso('');if(await m.executar(async()=>{if(!anterior)return criarCRM('integracao_agente_estrategias',dados);const r=await requisicao(`integracao_agente_estrategias?agente=eq.${dados.agente}&versao=eq.${anterior.versao}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(dados)});if(!r?.length)throw new Error('A estratégia foi alterada por outra pessoa. Atualize a página antes de salvar.');}))setAviso('Estratégia salva. Será aplicada nas próximas consultas e sugestões.');};
 return <section><h2>Estratégias dos agentes IA</h2><p>Direcione as próximas análises e sugestões. Metas e análises já salvas continuam como estão.</p><EstadoModulo modulo={m}/>{aviso&&<p role="status">{aviso}</p>}{m.dados&&['tecnico','comercial'].map(agente=>{const r=m.dados.find(x=>x.agente===agente);return <Editor key={`${agente}:${r?.versao||0}`} agente={agente} registro={r} ocupado={m.ocupado} salvar={salvar}/>;})}</section>;
}
