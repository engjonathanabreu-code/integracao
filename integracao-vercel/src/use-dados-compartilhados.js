import {filaRascunho} from './fila-rascunho.js';
import {metasLocaisParaCompartilhar} from './metas-identidade.js';
import {abrirArquivos,fecharArquivos,arquivosPendentes,prepararArmazenamento,confirmarArquivos} from './arquivos-compartilhados.js';
import {useRef,useState,useEffect} from 'react';
import {invalidarIndiceClientes,temSessao,definirSessao,lerBase,lerMoradoresMunicipio,lerFichaCliente,lerResumoMoradores,projetar,copy,mesclarEdicoes,prepararEdicao,prepararArquivos,gravarOperacoes} from './dados-compartilhados.js';

export function useDadosCompartilhados({setDb,storage,baseLimpa}) {
  const current=useRef(null), server=useRef(null), actor=useRef(null), busy=useRef(false), pending=useRef(false), timer=useRef(null), generation=useRef(0);
  const [status,setStatus]=useState(''),[error,setError]=useState('');
  const [summaryReady,setSummaryReady]=useState(false),[summaryError,setSummaryError]=useState('');
  const summaryJob=useRef(null);
  const attempt=useRef(null),lastRefresh=useRef(0);
  const municipios=useRef(new Set()), opening=useRef(false), municipalityLoads=useRef(new Map());
  const carregarBase=async(seed)=>{
    const base=await lerBase({municipios:[...municipios.current]});
    // Keep opened clients without a municipality available during refresh/save.
    const avulsos=(seed?.processos||[]).filter(p=>!p.municipioId&&!p._resumo&&p._compartilhado);
    for(const cliente of avulsos){
      const carga=await lerFichaCliente(cliente);
      base.fin_receb_clientes.push(...carga.clientes.filter(c=>!base.fin_receb_clientes.some(x=>x.id===c.id)));
      base.integracao_moradores.push(...carga.complementos.filter(e=>!base.integracao_moradores.some(x=>x.registro_id===e.registro_id)));
    }
    base._moradoresResumo=server.current?.base._moradoresResumo||[];
    lastRefresh.current=Date.now();return base;
  };
  const storageKey=()=>`integracao-compartilhado-${actor.current?.erpRef}`;
  const publish=db=>{current.current=db;setDb(db);};
  const gravaRascunho=useRef(null);if(!gravaRascunho.current)gravaRascunho.current=filaRascunho(storage);
  const saveDraft=async()=>{if(actor.current && current.current) {const owner=actor.current.erpRef;await gravaRascunho.current(storageKey(),JSON.stringify({db:current.current,baseline:server.current?.db,base:server.current?.base,pending:pending.current,attempt:attempt.current,municipios:[...municipios.current]}),owner);}};
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
        if(gen!==generation.current)return;
        const assets=await prepararArmazenamento(server.current,after);
        if(gen!==generation.current)return;
        attempt.current={before,after,operations:[...operations,...files,...assets.operations],sent:assets.sent,id:crypto.randomUUID()};
        await saveDraft();
      }
      const {after,operations,id,sent}=attempt.current;
      if(!operations.length){server.current={...server.current,db:copy(after)};attempt.current=null;pending.current=arquivosPendentes()||JSON.stringify(current.current)!==JSON.stringify(after);setStatus('Dados atualizados');await saveDraft();if(pending.current)timer.current=setTimeout(flush,500);return;}
      const result=await gravarOperacoes(operations,id);
      if(gen!==generation.current) return;
      const aliases=result.aliases||{};
      const saved=remap(after,aliases), latest=remap(current.current,aliases);
      const base=await carregarBase(saved);
      if(gen!==generation.current) return;
      await confirmarArquivos(sent,base);
      const state=projetar(base,saved);
      server.current=state;
      attempt.current=null;
      publish(mesclarEdicoes(saved,latest,state.db));
      pending.current=arquivosPendentes()||JSON.stringify(current.current)!==JSON.stringify(state.db);
      setStatus(pending.current?'Salvando próximas alterações…':'Dados compartilhados no Supabase');
      await saveDraft();
      atualizarResumo();
      if(pending.current) timer.current=setTimeout(flush,500);
    } catch(e) {
      if(gen!==generation.current)return;
      setError(e.message);setStatus('Alterações pendentes — dados locais preservados.');await saveDraft();
    } finally {busy.current=false;}
  };
  const open=async (user,legacy)=>{
    actor.current=user;generation.current++;server.current=null;municipios.current=new Set();setSummaryReady(false);setSummaryError('');opening.current=true;setStatus('Carregando municípios…');setError('');
    try {
    const cached=await storage.get(storageKey());
    const draft=cached?JSON.parse(cached):null;
    attempt.current=draft?.attempt||null;
    if(!temSessao()) {
      if(!draft?.base) throw new Error('Entre conectado uma vez para disponibilizar os dados desta conta neste aparelho.');
      await abrirArquivos(user,draft.base,storage);
      server.current={...projetar(draft.base,draft.baseline),db:draft.baseline};publish(draft.db);pending.current=!!draft.pending;
      municipios.current=new Set(draft.municipios||[]);setSummaryReady(true);
      setStatus('Modo offline. Entre novamente conectado para enviar as alterações.');
      return current.current.usuarios.find(u=>u.erpRef===user.erpRef)||user;
    }
    const base=await carregarBase(baseLimpa());
    await abrirArquivos(user,base,storage);
    if(legacy && !(await storage.get('integracao-antes-compartilhamento'))) await storage.set('integracao-antes-compartilhamento',JSON.stringify(legacy));
    const legacyOwner=await storage.get('integracao-dono-base-local');
    if(!legacyOwner)await storage.set('integracao-dono-base-local',user.erpRef);
    const seed=(!legacyOwner||legacyOwner===user.erpRef?legacy:null) || baseLimpa();
    if(!legacy) {seed.setoresMeta=[];seed.agendas=[];}
    const state=projetar(base,draft?.db||seed);
    // In-flight edits from an earlier session retain their original baseline for conflict checks.
    if(draft?.pending && draft.baseline) {
      municipios.current=new Set(draft.municipios||[...new Set((draft.baseline.processos||[]).filter(p=>!p._resumo).map(p=>p.municipioId))]);
      const prior=projetar(draft.base||base,draft.baseline);
      server.current={...prior,db:draft.baseline};publish(draft.db);pending.current=true;
      setStatus('Há alterações locais aguardando revisão ou envio.');
    } else {
      const locais=metasLocaisParaCompartilhar(base,state.db,user);
      const ids=new Set(locais.map(m=>m.id));
      // Local-only metas are not a server baseline: enqueue their complete creation,
      // including assignees, checklist and attachments, on the next flush.
      server.current=locais.length?{...state,db:{...state.db,metas:state.db.metas.filter(m=>!ids.has(m.id))}}:state;
      publish(state.db);pending.current=locais.length>0;
      setStatus(locais.length?`${locais.length} meta(s) local(is) aguardando envio aos responsáveis.`:'Dados compartilhados no Supabase');
    }
    pending.current=pending.current||arquivosPendentes();
    await saveDraft();
    if(pending.current)timer.current=setTimeout(flush,700);
    atualizarResumo();
    return current.current.usuarios.find(u=>u.erpRef===user.erpRef)||user;
    } finally {opening.current=false;}
  };
  const atualizarResumo=()=>{
    if(summaryJob.current||!server.current||!temSessao())return summaryJob.current;
    const gen=generation.current;setSummaryError('');
    const job=(async()=>{
      try {
        const resumos=await lerResumoMoradores(current.current);
        while(busy.current&&gen===generation.current)await new Promise(r=>setTimeout(r,50));
        if(gen!==generation.current||!server.current)return;
        const prior=server.current,base={...prior.base,_moradoresResumo:resumos};
        const state=projetar(base,prior.db);
        const merged=mesclarEdicoes(prior.db,current.current,state.db);
        server.current=state;publish(merged);setSummaryReady(true);await saveDraft();
      }catch(e){if(gen===generation.current)setSummaryError(e.message);}
    })();summaryJob.current=job;
    job.finally(()=>{if(summaryJob.current===job)summaryJob.current=null;});return job;
  };
  const loadMunicipio=async(id,cliente=null)=>{
    const individual=!id && cliente;
    const chave=individual ? `cliente:${cliente.id}` : id;
    if(individual && current.current?.processos.some(p=>p.id===cliente.id&&!p._resumo))return current.current;
    if(!individual && municipios.current.has(id) && (!cliente || current.current?.processos.some(p=>(p.id===cliente.id||(cliente.financeiroRef&&p.financeiroRef===cliente.financeiroRef))&&!p._resumo)))return current.current;
    if(municipalityLoads.current.has(chave))return municipalityLoads.current.get(chave);
    const gen=generation.current;
    const job=(async()=>{
      if(!temSessao()){
        if(!municipios.current.has(chave)&&(server.current?.base._moradoresResumo||current.current?.processos.some(p=>p.municipioId===id&&p._resumo)))throw new Error('Conecte-se para baixar os moradores deste município.');
        if(!individual)municipios.current.add(id);return current.current;
      }
      const started=Date.now();
      while(busy.current){if(Date.now()-started>35000)throw new Error('Aguarde a sincronização terminar e tente abrir o município novamente.');await new Promise(r=>setTimeout(r,50));if(gen!==generation.current)throw new Error('Sessão encerrada.');}
      busy.current=true;
      try {
        const carga=individual ? await lerFichaCliente(cliente) : await lerMoradoresMunicipio(id);
        if(gen!==generation.current)throw new Error('Sessão encerrada.');
        const prior=server.current;
        const clientIds=new Set(carga.clientes.map(c=>c.id)),extraIds=new Set(carga.complementos.map(e=>e.registro_id));
        const base={...prior.base,
          fin_receb_clientes:[...prior.base.fin_receb_clientes.filter(c=>(individual||c.municipio_id!==id)&&!clientIds.has(c.id)),...carga.clientes],
          integracao_moradores:[...(prior.base.integracao_moradores||[]).filter(e=>!extraIds.has(e.registro_id)&&(individual||e.dados?.municipioId!==id)),...carga.complementos]};
        const state=projetar(base,prior.db);
        const merged=mesclarEdicoes(prior.db,current.current,state.db);
        server.current=state;publish(merged);if(!individual)municipios.current.add(id);
        await saveDraft();return current.current;
      } finally {busy.current=false;if(pending.current)timer.current=setTimeout(flush,500);}
    })();
    municipalityLoads.current.set(chave,job);
    try {return await job;} finally {municipalityLoads.current.delete(chave);}
  };
  const mutate=(fn,entry)=>{
    if(!current.current || !server.current) throw new Error('Os dados compartilhados ainda estão carregando.');
    const next=fn(copy(current.current));
    const previousSummaries=new Map(current.current.processos.filter(p=>p._resumo).map(p=>[p.id,p]));
    for(const p of next.processos||[])if(previousSummaries.has(p.id)){if(JSON.stringify(p)!==JSON.stringify(previousSummaries.get(p.id)))throw new Error('Abra o município antes de alterar este morador.');previousSummaries.delete(p.id);}
    if(previousSummaries.size)throw new Error('Abra o município antes de remover moradores.');
    if(entry)next.auditoria=[entry,...(next.auditoria||[])].slice(0,2000);
    publish(next);pending.current=true;setStatus('Alterações pendentes');saveDraft().catch(e=>setError(e.message));
    clearTimeout(timer.current);timer.current=setTimeout(flush,700);
  };
  const refresh=async({force=false,manual=false}={})=>{
    if(!force&&Date.now()-lastRefresh.current<120000)return;
    if(manual) {
      if(!navigator.onLine)throw new Error('Conecte-se à internet para atualizar os dados.');
      if(!actor.current||!server.current||!temSessao())throw new Error('Não há conexão autenticada disponível para atualizar os dados.');
      if(opening.current||busy.current)throw new Error('Há uma sincronização em andamento. Aguarde e tente novamente.');
      if(pending.current)await flush();
      if(pending.current)throw new Error('Há alterações aguardando gravação. Elas foram preservadas; resolva o aviso de sincronização antes de atualizar.');
    }
    if(!actor.current||opening.current||!server.current||busy.current||pending.current||!temSessao()||!navigator.onLine||(!manual&&document.visibilityState==='hidden'))return;
    busy.current=true;const gen=generation.current;
    try {const base=await carregarBase(current.current);if(gen!==generation.current||pending.current){if(manual)throw new Error('A atualização foi interrompida para preservar as alterações. Tente novamente.');return;}await abrirArquivos(actor.current,base,storage);if(gen!==generation.current||pending.current){if(manual)throw new Error('A atualização foi interrompida para preservar as alterações. Tente novamente.');return;}const state=projetar(base,current.current);server.current=state;publish(state.db);await saveDraft();setStatus('Dados compartilhados no Supabase');setError('');atualizarResumo();}
    catch(e){setError(e.message);if(manual)throw e;} finally {busy.current=false;if(pending.current)timer.current=setTimeout(flush,500);}
    if(manual){invalidarIndiceClientes();await atualizarResumo();}
  };
  const close=()=>{saveDraft().catch(()=>{});generation.current++;clearTimeout(timer.current);fecharArquivos();summaryJob.current=null;municipalityLoads.current.clear();actor.current=null;server.current=null;current.current=null;pending.current=false;definirSessao(null);setStatus('');setError('');};
  const reopen=async()=>{
    if(busy.current)return;
    try {
      const snapshot=JSON.stringify({dados:current.current,base:server.current?.db,envio:attempt.current},null,2);
      await storage.set(`${storageKey()}-revisao-${Date.now()}`,snapshot);
      const url=URL.createObjectURL(new Blob([snapshot],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='integracao-rascunho-preservado.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus('Cópia baixada. As alterações continuam pendentes neste navegador; use Tentar salvar novamente.');await saveDraft();
    }catch(e){setError(e.message);}
  };
  useEffect(()=>{
    const tick=setInterval(refresh,120000);
    const online=()=>{if(pending.current)flush();else refresh({force:true});};
    const filePending=()=>{if(!actor.current)return;pending.current=true;setStatus('Arquivos aguardando gravação no Supabase');clearTimeout(timer.current);timer.current=setTimeout(flush,700);};
    const protegerSaida=e=>{if(pending.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protegerSaida);
    window.addEventListener('integracao:arquivo-pendente',filePending);
    window.addEventListener('online',online);window.addEventListener('focus',refresh);
    return()=>{window.removeEventListener('beforeunload',protegerSaida);clearInterval(tick);clearTimeout(timer.current);window.removeEventListener('integracao:arquivo-pendente',filePending);window.removeEventListener('online',online);window.removeEventListener('focus',refresh);};
  },[]);
  return {open,mutate,close,flush,refresh,reopen,loadMunicipio,status,error,summaryReady,summaryError,atualizarResumo,ready:()=>!!server.current};
}
