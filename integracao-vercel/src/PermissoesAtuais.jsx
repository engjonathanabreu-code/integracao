import React,{useState} from 'react';
import {permissoes,SETORES} from './permissoes.js';
import {representarPermissoes} from './permissoes-apresentacao.js';
import './planejamento-metas.css';
export default function PermissoesAtuais({db,usuario,gerenciaMetas}) {
  const [id,setId]=useState(usuario.id),[busca,setBusca]=useState('');if(!permissoes(usuario).usuarios)return null;
  const alvo=db.usuarios.find(u=>u.id===id)||usuario;const rows=representarPermissoes(alvo,{gerenciaMetas}).filter(r=>(r.recurso+' '+r.acao).toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  return <section className="permissoes-atuais"><h1>Permissões atuais</h1><p>Mesmo acesso existente, organizado por recurso e ação. Nenhum direito é concedido, removido ou alterado por esta tela.</p>
    <div className="pa-grade"><aside className="card"><h2>Perfil e acesso</h2><label className="rot">Usuário<select className="inp" value={alvo.id} onChange={e=>setId(e.target.value)}>{db.usuarios.map(u=><option key={u.id} value={u.id}>{u.nome}{u.ativo===false?' (inativo)':''}</option>)}</select></label>
      <p><strong>{alvo.nome}</strong></p><p>{SETORES[alvo.setor]?.nome||alvo.setor} · {alvo.funcao||'Sem função'}</p><p className="ajuda">Estado atual: {alvo.ativo===false?'inativo':'ativo'}. {alvo.ativo===false&&'Uma conta inativa não pode iniciar uma sessão, independentemente das capacidades do seu perfil.'}</p>
      <p className="ajuda">Escopo e condições seguem as regras atuais do registro, do vínculo e do servidor. O setor não é convertido em um novo papel.</p></aside>
      <div className="card"><h2>Matriz do perfil</h2><input className="inp" type="search" aria-label="Buscar recurso ou ação" placeholder="Buscar recurso ou ação" value={busca} onChange={e=>setBusca(e.target.value)}/>
        <div className="rolagem"><table className="tab"><thead><tr><th>Recurso</th><th>Ação</th><th>Capacidade atual</th></tr></thead><tbody>{rows.map(r=><tr key={r.chave+'-'+r.acao}><td>{r.recurso}</td><td>{r.acao}</td><td><span className={'pa-etiqueta '+(r.permitido?'permitido':'restrito')}>{r.permitido?'Habilitada no perfil':'Não habilitada no perfil'}</span></td></tr>)}</tbody></table></div>
        <p className="ajuda">Esta matriz reproduz as funções de permissão existentes. “Habilitada” não ignora condições de uma meta, participação no chat, escopo financeiro, autorização de anexos ou validação de RLS/API. Use “Usuários e setores” para o fluxo de gestão já existente.</p></div>
    </div>
  </section>;
}
