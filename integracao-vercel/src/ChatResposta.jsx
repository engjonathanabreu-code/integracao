import React, {useEffect, useState} from 'react';
import {Reply, X} from 'lucide-react';
import './chat-resposta.css';

export function useRespostaChat(conversa, area) {
  const [selecionada, setSelecionada] = useState(null);
  useEffect(() => setSelecionada(null), [conversa?.id]);
  const citada = selecionada?.conversaId === conversa?.id
    ? conversa?.mensagens.find(m => m.id === selecionada.id) : null;
  return {
    citada,
    responder: mensagem => { setSelecionada({conversaId: conversa.id, id: mensagem.id}); area.current?.focus(); },
    cancelar: () => setSelecionada(null),
  };
}

export function irParaMensagem(container, id) {
  const alvo = Array.from(container?.querySelectorAll('[data-mensagem-id]') || []).find(el => el.dataset.mensagemId === id);
  if (!alvo) return false;
  alvo.scrollIntoView({block: 'nearest', behavior: 'auto'});
  alvo.focus({preventScroll: true});
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    alvo.animate?.([{outline: '3px solid currentColor'}, {outline: '3px solid transparent'}], {duration: 1200});
  }
  return true;
}

function Conteudo({mensagem, usuarios, usuarioId}) {
  if (!mensagem) return <span>Mensagem indisponível</span>;
  const autor = mensagem.autorId === usuarioId ? 'Você' : usuarios.find(u => u.id === mensagem.autorId)?.nome || 'Usuário';
  return <><strong>{autor}</strong><span className="chat-citacao-texto">{mensagem.texto || mensagem.arquivoERP?.nome || 'Anexo'}</span></>;
}

export function CitacaoMensagem({mensagem, usuarios, usuarioId, onIr}) {
  return <button type="button" className="chat-citacao" disabled={!mensagem} onClick={onIr} aria-label="Ir para a mensagem citada"><Conteudo mensagem={mensagem} usuarios={usuarios} usuarioId={usuarioId}/></button>;
}

export function PreviaResposta({mensagem, usuarios, usuarioId, onCancelar}) {
  if (!mensagem) return null;
  return <div className="chat-resposta-previa" role="status"><Reply size={18} aria-hidden="true"/><div><span className="chat-resposta-rotulo">Respondendo a</span><Conteudo mensagem={mensagem} usuarios={usuarios} usuarioId={usuarioId}/></div><button type="button" className="btn-icone" onClick={onCancelar} aria-label="Cancelar resposta citada"><X size={18}/></button></div>;
}

export function BotaoResponder({onClick}) {
  return <button type="button" className="chat-responder" onClick={onClick} aria-label="Responder a esta mensagem"><Reply size={14} aria-hidden="true"/>Responder</button>;
}
