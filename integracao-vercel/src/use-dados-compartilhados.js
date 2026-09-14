import {useRef,useState,useEffect} from 'react';
import {temSessao,definirSessao,lerBase,projetar,copy,mesclarEdicoes,prepararEdicao,prepararArquivos,gravarOperacoes} from './dados-compartilhados.js';

export function useDadosCompartilhados({setDb,storage,baseLimpa}) {
  const current=useRef(null), server=useRef(null), actor=useRef(null), busy=useRef(false), pending=useRef(false), timer=useRef(null), generation=useRef(0);
  const [status,setStatus]=useState(''),[error,setError]=useState('');
  const attempt=useRef(null);
  const storageKey=()=>`integracao-compartilhado-${actor.current?.erpRef}`;
  const publish=db=>{current.current=db;setDb(db);};
  const saveDraft=async()=>{if(actor.current && current.current) {const owner=actor.current.erpRef;await storage.set(storageKey(),JSON.stringify({db:current.current,baseline:server.current?.db,base:server.current?.base,pending:pending.current,attempt:attempt.current}));await storage.set('integracao-ultima-conta',owner);}};
  const remap=(value,aliases)=>{
    if(!value) return value;
    if(typeof value==='string') return aliases[value]||value;
    if(Array.isArray(value)) return value.map(x=>remap(x,aliases));
    if(typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[aliases[k]||k,remap(v,aliases)]));
    return value;
  };
  const flush=async()=>{
    if(busy.current || !pending.current || !server.current || !temSessao()) return;
    if(!navigator.onLine) {setStatus('Alterações guardadas neste aparelho; aguardando conexão.');await saveDraft();return;}
    busy.current=true;const gen=generation.current;
    const who=actor.current;
    setStatus('Salvando alterações no Supabase…');setError('');
    try {
      if(!attempt.current) {
        const before=copy(server.current.db),after=copy(current.current);
        const operations=prepararEdicao(before,after,server.current,who);
        const files=await prepararArquivos(before,after,storage,who);
        attempt.current={before,after,operations:[...operations,...files],id:crypto.randomUUID()};
        await saveDraft();
      }
      const {after,operations,id}=attempt.current;
      const result=await gravarOperacoes(operations,id);
      if(gen!==generation.current) return;
      const aliases=result.aliases||{};
      const saved=remap(after,aliases), latest=remap(current.current,aliases);
      const base=await lerBase();
      if(gen!==generation.current) return;
      const state=projetar(base,saved);
      server.current=state;
      attempt.current=null;
      publish(mesclarEdicoes(saved,latest,state.db));
      pending.current=JSON.stringify(current.current)!==JSON.stringify(state.db);
      setStatus(pending.current?'Salvando próximas alterações…':'Dados compartilhados no Supabase');
      await saveDraft();
      if(pending.current) timer.current=setTimeout(flush,500);
    } catch(e) {
      if(gen!==generation.current)return;
      setError(e.message);setStatus('Alterações pendentes — dados locais preservados.');await saveDraft();
    } finally {busy.current=false;}
  };
  const open=async (user,legacy)=>{
    actor.current=user;generation.current++;setStatus('Abrindo os dados compartilhados…');setError('');
    const cached=await storage.get(storageKey());
    const draft=cached?JSON.parse(cached):null;
    attempt.current=draft?.attempt||null;
    if(!temSessao()) {
      if(!draft?.base) throw new Error('Entre conectado uma vez para disponibilizar os dados desta conta neste aparelho.');
      server.current={...projetar(draft.base,draft.baseline),db:draft.baseline};publish(draft.db);pending.current=!!draft.pending;
      setStatus('Modo offline. Entre novamente conectado para enviar as alterações.');
      return current.current.usuarios.find(u=>u.erpRef===user.erpRef)||user;
    }
    const base=await lerBase();
    if(legacy && !(await storage.get('integracao-antes-compartilhamento'))) await storage.set('integracao-antes-compartilhamento',JSON.stringify(legacy));
    const legacyOwner=await storage.get('integracao-dono-base-local');
    if(!legacyOwner)await storage.set('integracao-dono-base-local',user.erpRef);
    const seed=(!legacyOwner||legacyOwner===user.erpRef?legacy:null) || baseLimpa();
    if(!legacy) {seed.setoresMeta=[];seed.agendas=[];}
    const state=projetar(base,draft?.db||seed);
    // In-flight edits from an earlier session retain their original baseline for conflict checks.
    if(draft?.pending && draft.baseline) {
      const prior=projetar(draft.base||base,draft.baseline);
      server.current={...prior,db:draft.baseline};publish(draft.db);pending.current=true;
      setStatus('Há alterações locais aguardando revisão ou envio.');
    } else {server.current=state;publish(state.db);pending.current=false;setStatus('Dados compartilhados no Supabase');}
    await saveDraft();
    return current.current.usuarios.find(u=>u.erpRef===user.erpRef)||user;
  };
  const mutate=(fn,entry)=>{
    if(!current.current || !server.current) throw new Error('Os dados compartilhados ainda estão carregando.');
    const next=fn(copy(current.current));
    if(entry)next.auditoria=[entry,...(next.auditoria||[])].slice(0,2000);
    publish(next);pending.current=true;setStatus('Alterações pendentes');saveDraft().catch(e=>setError(e.message));
    clearTimeout(timer.current);timer.current=setTimeout(flush,700);
  };
  const refresh=async()=>{
    if(!actor.current||busy.current||pending.current||!temSessao()||!navigator.onLine)return;
    busy.current=true;const gen=generation.current;
    try {const base=await lerBase();if(gen!==generation.current||pending.current)return;const state=projetar(base,current.current);server.current=state;publish(state.db);setStatus('Dados compartilhados no Supabase');setError('');}
    catch(e){setError(e.message);} finally {busy.current=false;if(pending.current)timer.current=setTimeout(flush,500);}
  };
  const close=()=>{saveDraft().catch(()=>{});generation.current++;clearTimeout(timer.current);actor.current=null;server.current=null;current.current=null;pending.current=false;definirSessao(null);setStatus('');setError('');};
  const reopen=async()=>{
    if(busy.current)return;
    try {
      const snapshot=JSON.stringify({dados:current.current,base:server.current?.db,envio:attempt.current},null,2);
      await storage.set(`${storageKey()}-revisao-${Date.now()}`,snapshot);
      const url=URL.createObjectURL(new Blob([snapshot],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='integracao-rascunho-preservado.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      const base=await lerBase();const state=projetar(base,server.current.db);
      attempt.current=null;pending.current=false;server.current=state;publish(state.db);setError('');setStatus('Versão atual aberta. O rascunho anterior foi preservado para revisão.');await saveDraft();
    }catch(e){setError(e.message);}
  };
  useEffect(()=>{
    const tick=setInterval(refresh,30000);
    const online=()=>{if(pending.current)flush();else refresh();};
    window.addEventListener('online',online);window.addEventListener('focus',refresh);
    return()=>{clearInterval(tick);clearTimeout(timer.current);window.removeEventListener('online',online);window.removeEventListener('focus',refresh);};
  },[]);
  return {open,mutate,close,flush,refresh,reopen,status,error,ready:()=>!!server.current};
}
