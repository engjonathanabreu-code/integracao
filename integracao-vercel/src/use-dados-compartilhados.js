import {exportarCopiaRecuperacao} from './copia-recuperacao.js';
import {recuperarAnexosMetas} from './recuperacao-anexos-metas.js';
import {criarDiarioCompartilhado} from './diario-compartilhado.js';
import {semearOriginais,extrairIntencao} from './intencoes-edicao.js';
import {selecionarArquivosDaEdicao,arquivosDaIntencao} from './arquivos-intencoes.js';
import {remapearIdentidades as remap} from './aliases-tipados.js';
import {separarCriacoesPendentes,recuperarCorDeAgenda,mensagemRejeicao} from './recuperacao-sincronizacao.js';
import {temConexao} from './conexao-rede.js';
import {criarConfirmacoesMutacoes,erroConfirmacao,alteracoesConfirmadas} from './confirmacao-mutacoes.js';
import {erroConcorrencia} from './concorrencia.js';
import {conciliarMaisRecentes as conciliarEdicoes,atualizarAutomaticamente as atualizarComRascunho,preservarRegistrosAusentes,separarReservasConflitantes} from './conciliacao-automatica.js';
import {rejeicaoDefinitiva} from './atualizacao-rascunho.js';
import {temEdicaoEmAndamento} from './protecao-edicao.js';
import {conectarTempoReal} from './tempo-real.js';
import {tabelasDosGrupos,falhaTransitoria,gruposDasOperacoes} from './sincronizacao-regras.js';
import {filaRascunho} from './fila-rascunho.js';
import {clientesDasOperacoes,clientesComEdicao,clientesDasIntencoes,fichasVisiveis,atualizarFichas,preservarFichaAnterior} from './sincronizacao-clientes.js';
import {metasLocaisParaCompartilhar} from './metas-identidade.js';
import {gruposDeLeituraDaIntencao} from './leitura-intencoes.js';
import {abrirArquivos,fecharArquivos,capturarArquivos,arquivosPendentes,prepararArmazenamento,confirmarArquivos,reconhecerArquivos} from './arquivos-compartilhados.js';
import {useRef,useState,useEffect} from 'react';
import {diagnosticoOperacao} from './diagnostico-sincronizacao.js';
import {diagnosticosSuporte,prepararRecuperacaoAtualizacao,edicaoVisivelParaAtualizar} from './suporte-remoto-local.js';
import {configERP,consultarReciboOperacao,tokenTempoReal,invalidarIndiceClientes,temSessao,definirSessao,lerBase,lerMoradoresMunicipio,lerFichaCliente,projetar,copy,prepararEdicao,prepararArquivos,gravarOperacoes} from './dados-compartilhados.js';

export function useDadosCompartilhados({setDb,storage,baseLimpa,usarDiario=true}) {
  const diario=useRef(null),[pendencias,setPendencias]=useState([]),[previaPendencia,setPreviaPendencia]=useState(null);
  const current=useRef(null), server=useRef(null), actor=useRef(null), busy=useRef(false), pending=useRef(false), timer=useRef(null), generation=useRef(0);
  const vivo=useRef(null),avisos=useRef(new Set()),avisoTimer=useRef(null),retentativas=useRef(0);
  const [tempoReal,setTempoReal]=useState('desconectado');
  const [falhasAtualizacao,setFalhasAtualizacao]=useState([]);
  const [status,setStatus]=useState(''),[error,setError]=useState('');
  const recuperacoes=useRef([]),[reservasPreservadas,setReservasPreservadas]=useState(0);
  const [conflitos,setConflitos]=useState([]),revisao=useRef(null);
  const [summaryReady,setSummaryReady]=useState(false),[summaryError,setSummaryError]=useState('');
  const summaryJob=useRef(null);
  const attempt=useRef(null),lastRefresh=useRef(0);
  const confirmacoes=useRef(null);
  if(!confirmacoes.current)confirmacoes.current=criarConfirmacoesMutacoes();
  const rejeitarConfirmacoes=(mensagem,codigo,causa)=>confirmacoes.current.falhar(erroConfirmacao(mensagem,codigo,causa));
  const municipioAtivo=useRef(null),desatualizados=useRef(new Set());
  const municipios=useRef(new Set()), opening=useRef(false), municipalityLoads=useRef(new Map());
  const restaurarMunicipios=ids=>{
    municipios.current=new Set(ids);
    // A restored draft is not proof of a complete current municipal load.
    // Opening recovers only edited client files; entering a nucleus must fetch all.
    municipios.current.forEach(id=>desatualizados.current.add(id));
  };
  const conferirGeracao=gen=>{if(gen!==generation.current)throw Object.assign(new Error('Sessão encerrada.'),{code:'SESSAO_ALTERADA'});};
  const carregarBase=async(seed,grupos=null,{fichasAvulsas=true}={})=>{
    const gen=generation.current;
    const tabelas=grupos?tabelasDosGrupos(grupos):null;
    const base=await lerBase({municipios:municipioAtivo.current&&municipios.current.has(municipioAtivo.current)?[municipioAtivo.current]:[],tabelas,anterior:grupos?server.current?.base:null});
    conferirGeracao(gen);
    if(server.current&&(!grupos||grupos.includes('clientes'))){
      const antigos=server.current.base,ativos=new Set(base.fin_receb_clientes.map(c=>c.id)),extras=new Set((base.integracao_moradores||[]).map(e=>e.registro_id)), idsAtivos=new Set(antigos.fin_receb_clientes.filter(c=>c.municipio_id===municipioAtivo.current).map(c=>c.id));
      base.fin_receb_clientes=[...antigos.fin_receb_clientes.filter(c=>c.municipio_id!==municipioAtivo.current&&!ativos.has(c.id)),...base.fin_receb_clientes];
      base.integracao_moradores=[...(antigos.integracao_moradores||[]).filter(e=>!extras.has(e.registro_id)&&!idsAtivos.has(e.referencia_id)&&e.dados?.municipioId!==municipioAtivo.current),...(base.integracao_moradores||[])];
    }
    // Keep opened clients without a municipality available during refresh/save.
    const avulsos=(seed?.processos||[]).filter(p=>!p.municipioId&&!p._resumo&&p._compartilhado);
    if(usarDiario&&!fichasAvulsas)for(const cliente of avulsos)preservarFichaAnterior(base,server.current?.base,cliente);
    base._moradoresResumo=server.current?.base._moradoresResumo||[];
    if(usarDiario){
      base._falhasFichas=structuredClone(server.current?.base._falhasFichas||[]);
      for(const falha of base._falhasFichas)preservarFichaAnterior(base,server.current?.base,{id:falha.id});
    }
    await atualizarFichas(base,fichasAvulsas&&(!grupos||grupos.includes('clientes'))?avulsos:[],lerFichaCliente,{isolarFalhas:usarDiario,anterior:server.current?.base});
    conferirGeracao(gen);lastRefresh.current=Date.now();return base;
  };
  // Projection carries local-only records for display; they are not server rows.
  // Keep them out of the remote baseline when rebasing pending edits, otherwise
  // their creation disappears from the diff and only child history may be sent.
  const projetarRemoto=(base,seed,baseline=server.current?.db)=>{
    const state=separarCriacoesPendentes(projetar(base,seed),baseline,attempt.current,actor.current);
    const locais=new Set(metasLocaisParaCompartilhar(base,state.db,actor.current).map(m=>m.id));
    return locais.size?{...state,db:{...state.db,metas:state.db.metas.filter(m=>!locais.has(m.id))}}:state;
  };
  const storageKey=()=>`integracao-compartilhado-${actor.current?.erpRef}${usarDiario?'-cache-v2':''}`;
  const atualizarPendentes=(base,before,local,envio=attempt.current)=>{
    const clientes=[...clientesComEdicao(before,local),...clientesDasOperacoes((envio?.operations||[]).map(op=>({...op,remove:false})),[...local.processos,...before.processos])];
    return atualizarFichas(base,[...new Map(clientes.map(c=>[c.id,c])).values()],lerFichaCliente);
  };
  const publish=db=>{current.current=db;setDb(db);};
  const gravaRascunho=useRef(null);if(!gravaRascunho.current)gravaRascunho.current=filaRascunho(storage);
  const saveDraft=async()=>{if(actor.current && current.current) {const owner=actor.current.erpRef;await gravaRascunho.current(storageKey(),JSON.stringify({db:usarDiario?server.current?.db:current.current,baseline:server.current?.db,base:server.current?.base,pending:usarDiario?false:pending.current,attempt:usarDiario?null:attempt.current,recuperacoes:recuperacoes.current,municipios:[...municipios.current]}),owner);}};
  const atualizarDiario=items=>{
    setPendencias(items.filter(i=>!['confirmado','substituido','dispensado'].includes(i.estado)));
    pending.current=items.some(i=>!['confirmado','substituido','dispensado'].includes(i.estado));
    const bloqueadas=items.filter(i=>!['confirmado','substituido','dispensado'].includes(i.estado)).filter(i=>(i.estado.startsWith('bloqueado')||['persistencia_falhou','legado_revisao'].includes(i.estado))||i.proximaTentativa===Number.MAX_SAFE_INTEGER);
    setStatus(bloqueadas.length?`${bloqueadas.length} alteração(ões) aguardando revisão; as demais podem sincronizar.`:pending.current?'Alterações guardadas neste aparelho; aguardando confirmação.':'Dados compartilhados no Supabase');
    if(bloqueadas.length)setError('Abra Pendências para revisar cada alteração.');else setError('');
  };
  const edicoesDiario=()=>{
    const itens=diario.current?.itens()||[],aliases=Object.assign({},...itens.filter(i=>i.recibo).map(i=>i.recibo.aliases||{}));
    return remap(itens.filter(i=>!['confirmado','substituido','dispensado'].includes(i.estado)).flatMap(i=>i.original?.intencao?.edicoes||[]),aliases);
  };
  const hidratarFichasDiario=async(base,edicoes,gen,{isolarFalhas=false,anterior=server.current?.base}={})=>{
    // A summary load does not prove that an edited resident was deleted. Read
    // only the referenced files with the current account before projection.
    const clientes=clientesDasIntencoes(edicoes);
    await atualizarFichas(base,clientes,lerFichaCliente,{isolarFalhas,anterior});conferirGeracao(gen);
    setFalhasAtualizacao(base._falhasFichas||[]);
    return clientes;
  };
  const filtrarFichasDiario=(state,clientes)=>{
    const falhas=new Set((state.base._falhasFichas||[]).map(f=>f.id));
    const consultados=new Set(clientes.filter(c=>!falhas.has(c.id)).map(c=>c.id)),visiveis=fichasVisiveis(state.base,clientes);
    // A successful empty read is authoritative, including RLS-hidden rows.
    // Never restore such a row from the old cache or the pending original.
    state.db.processos=state.db.processos.filter(p=>!consultados.has(p.id)||visiveis.has(p.id));
    return state;
  };
  const iniciarDiario=(user,gen)=>{
    diario.current=criarDiarioCompartilhado({conta:user.erpRef,ativo:()=>gen===generation.current&&actor.current?.erpRef===user.erpRef,atualizou:atualizarDiario,notificar:()=>{if(gen===generation.current){clearTimeout(timer.current);timer.current=setTimeout(()=>refresh({force:true}),400);}},
      carregar:async edicoes=>{
        const seed=semearOriginais(server.current.db,edicoes);
        const base=await carregarBase(seed,gruposDeLeituraDaIntencao(edicoes),{fichasAvulsas:false});conferirGeracao(gen);
        const clientes=await hidratarFichasDiario(base,edicoes,gen);
        return filtrarFichasDiario(projetarRemoto(base,seed,server.current.db),clientes);
      },
      preparar:async(state,depois,arquivos)=>{
        const ops=prepararEdicao(state.db,depois,state,user),files=await prepararArquivos(state.db,depois,storage,user);conferirGeracao(gen);
        const assets=await prepararArmazenamento(state,depois,arquivos||{});conferirGeracao(gen);
        return {operacoes:[...ops,...files,...assets.operations],sent:assets.sent};
      },enviar:gravarOperacoes,consultarRecibo:consultarReciboOperacao,
      confirmar:async(item,state)=>{
        conferirGeracao(gen);server.current=state;
        if(item.preparado&&!alteracoesConfirmadas(item.preparado.antes,item.preparado.depois,state.db,item.recibo?.aliases||{},item.payload||[]))throw Object.assign(Error('O recibo existe, mas a leitura ainda diverge. Nenhuma gravação será repetida.'),{code:'LEITURA_DIVERGENTE',status:409});await confirmarArquivos(item.preparado?.sent,state.base);conferirGeracao(gen);
        confirmacoes.current.confirmar(item.preparado?.depois||state.db,state.db,{...item.recibo,operacoes:item.payload||[]});
      },
      aceitarLeitura:async(item,state)=>{
        conferirGeracao(gen);await reconhecerArquivos(item.preparado?.sent,state.base);conferirGeracao(gen);server.current=state;
      }
    });
    return diario.current;
  };
  const recuperarArquivosDiario=async()=>{
    const gen=generation.current,d=diario.current;if(!d||!server.current)return;
    await d.atualizar();conferirGeracao(gen);
    // A review can be archived before a local cache write is interrupted.
    // Complete only that same version; never turn the archived upload into a
    // fresh write or consume a newer local file when the app opens again.
    for(const item of d.itens().filter(i=>i.estado==='confirmado'&&i.recibo||i.estado==='dispensado'&&i.decisao?.tipo==='manter_remoto')){
      const fila=capturarArquivos(),selecionados=Object.fromEntries(Object.entries(item.preparado?.sent||arquivosDaIntencao(item,d.itens())).filter(([id,f])=>f.version&&fila[id]?.version===f.version));
      if(Object.keys(selecionados).length){await reconhecerArquivos(selecionados,server.current.base);conferirGeracao(gen);}
    }
    await d.adicionarArquivos(server.current.db,capturarArquivos());conferirGeracao(gen);
  };
  const flushDiario=async()=>{
    if(busy.current||opening.current||!diario.current||!server.current||!temSessao()||!temConexao())return;
    busy.current=true;const gen=generation.current,d=diario.current;
    try{await recuperarArquivosDiario();await d.executar();conferirGeracao(gen);publish(d.materializar(server.current.db));await saveDraft();}
    catch(e){if(gen===generation.current){setError(e.message);setStatus(e.code?.startsWith('PERSISTENCIA')?'Não foi possível guardar as alterações. Baixe uma cópia antes de sair.':'Alterações pendentes — consulte a revisão.');rejeitarConfirmacoes(e.message,e.code||'CONFIRMACAO_FALHOU',e);}}
    finally{if(gen===generation.current){busy.current=false;const itens=d.itens().filter(i=>!['confirmado','substituido','dispensado'].includes(i.estado));if(itens.some(i=>!i.estado.startsWith('bloqueado')&&!['persistencia_falhou','legado_revisao'].includes(i.estado)&&i.proximaTentativa!==Number.MAX_SAFE_INTEGER)){clearTimeout(timer.current);timer.current=setTimeout(flush,3000);}}}
  };

  const atualizarPreservando=async(base,remoto,gen,obter=()=>current.current)=>{
    for(let i=0;i<3;i++){
      const local=copy(obter()),resultado=atualizarComRascunho(base,local,remoto);
      if(!resultado.resolvidos.length)return resultado;
      await storage.set(`${storageKey()}-conflitos-${Date.now()}-${i}`,JSON.stringify({base,local,remoto,resolvidos:resultado.resolvidos}));
      if(gen!==generation.current)throw new Error('Sessão encerrada.');
      if(JSON.stringify(local)===JSON.stringify(obter()))return resultado;
    }
    throw new Error('Novas edições preservadas. A sincronização será retomada.');
  };

  const processarAvisos=async()=>{
    clearTimeout(avisoTimer.current);avisoTimer.current=null;
    if(!actor.current||!avisos.current.size)return;
    if(opening.current||busy.current||temEdicaoEmAndamento()||document.visibilityState==='hidden'||!temConexao()){avisoTimer.current=setTimeout(processarAvisos,1500);return;}
    const grupos=[...avisos.current];avisos.current.clear();
    const ok=await refresh({force:true,grupos:grupos.includes('*')?null:grupos});
    if(!ok)grupos.forEach(g=>avisos.current.add(g));
    if(avisos.current.size)avisoTimer.current=setTimeout(processarAvisos,ok?500:10000);
  };
  const avisar=grupo=>{if(grupo==='financeiro'){window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:grupo}}));return;}avisos.current.add(grupo||'*');if(grupo==='clientes'||!grupo){invalidarIndiceClientes();municipios.current.forEach(id=>desatualizados.current.add(id));}window.dispatchEvent(new CustomEvent('integracao:atualizacao',{detail:{modulo:grupo}}));if(!avisoTimer.current)avisoTimer.current=setTimeout(processarAvisos,400);};
  const iniciarTempoReal=()=>{vivo.current?.fechar();vivo.current=conectarTempoReal({url:configERP.url,chave:configERP.chave,token:tokenTempoReal,alterou:avisar,estado:setTempoReal});};
  const conciliar=async(escolhas={})=>{
    const gen=generation.current,anterior=server.current;
    const base=await carregarBase(current.current);
    if(gen!==generation.current)return false;
    await atualizarPendentes(base,anterior.db,current.current);
    if(gen!==generation.current)return false;
    const state=projetarRemoto(base,current.current);
    const baseAnterior=separarCriacoesPendentes({...state,db:anterior.db},anterior.db,attempt.current,actor.current).db;
    if(attempt.current?.rejeitada)publish(preservarRegistrosAusentes(anterior.db,current.current,state.db));
    if(attempt.current?.rejeitada&&/ativo já está reservado/.test(attempt.current.erro||'')){
      const versaoLocal=JSON.stringify(current.current);
      const reparo=separarReservasConflitantes(attempt.current.before,current.current,state.db);
      if(reparo.preservadas.length){
        await storage.set(`${storageKey()}-reservas-${Date.now()}`,JSON.stringify(reparo.preservadas));
        if(gen!==generation.current)return false;
        if(versaoLocal!==JSON.stringify(current.current)){timer.current=setTimeout(flush,500);return false;}
        recuperacoes.current.push(...reparo.preservadas);setReservasPreservadas(recuperacoes.current.length);publish(reparo.dados);
      }
    }
    // Choices apply only to the version actually shown in the review.
    const atuais=revisao.current&&JSON.stringify(revisao.current.remoto)===JSON.stringify(state.db)?escolhas:{};
    let resultado=conciliarEdicoes(baseAnterior,recuperarCorDeAgenda(current.current,state.db,attempt.current),state.db,atuais);
    if(resultado.conflitos.length){revisao.current={remoto:state.db};setConflitos(resultado.conflitos);setStatus('Alterações preservadas — aguardando suas escolhas.');setError('Há alterações diferentes no mesmo campo. Escolha os valores para continuar.');return false;}
    // Archive both versions before rebasing a rejected (never confirmed) request.
    await storage.set(`${storageKey()}-revisao-${Date.now()}`,JSON.stringify({dados:current.current,base:anterior.db,envio:attempt.current,remoto:state.db}));
    if(gen!==generation.current)return false;
    // Edits may arrive while the durable backup is being written.
    resultado=conciliarEdicoes(baseAnterior,recuperarCorDeAgenda(current.current,state.db,attempt.current),state.db,atuais);
    if(resultado.conflitos.length){revisao.current={remoto:state.db};setConflitos(resultado.conflitos);setError('Há alterações diferentes no mesmo campo. Escolha os valores para continuar.');return false;}
    server.current=state;publish(resultado.dados);attempt.current=null;revisao.current=null;setConflitos([]);setError('');
    pending.current=arquivosPendentes()||JSON.stringify(resultado.dados)!==JSON.stringify(state.db);
    if(!pending.current)retentativas.current=0;
    setStatus(pending.current?'Conciliando alterações…':'Dados compartilhados no Supabase');await saveDraft();
    if(pending.current)timer.current=setTimeout(flush,500);
    return true;
  };
  const resolverConflitos=async escolhas=>{
    if(busy.current||!revisao.current)return;
    // An unknown write may already have succeeded: consult its receipt first.
    if(attempt.current&&!attempt.current.rejeitada&&!attempt.current.confirmacao){await flush();if(attempt.current&&!attempt.current.rejeitada)return;}
    retentativas.current=0;
    busy.current=true;const gen=generation.current;
    try{await conciliar(escolhas);}catch(e){if(gen===generation.current)setError(e.message);}finally{if(gen===generation.current)busy.current=false;}
  };
  const flush=async()=>{
    if(usarDiario)return flushDiario();
    if(!temSessao()){rejeitarConfirmacoes('A sessão terminou antes da confirmação. As alterações continuam no rascunho.','SESSAO_ENCERRADA');return;}
    if(busy.current || !pending.current || !server.current) return;
    if(revisao.current&&(!attempt.current||attempt.current.rejeitada)&&!attempt.current?.confirmacao){rejeitarConfirmacoes('Há alterações concorrentes. Revise as diferenças antes de continuar.','CONFLITO_EDICAO');return;}
    if(!temConexao()) {rejeitarConfirmacoes('Sem conexão para confirmar a gravação. As alterações continuam no rascunho.','SEM_CONEXAO');setStatus('Alterações guardadas neste aparelho; aguardando conexão.');await saveDraft();return;}
    busy.current=true;const gen=generation.current;
    const who=actor.current;
    setStatus('Salvando alterações no Supabase…');setError('');
    try {
      if(attempt.current?.rejeitada){if(retentativas.current>=3){setError(mensagemRejeicao(attempt.current));setStatus('Alterações pendentes — dados locais preservados.');return;}await conciliar();return;}
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
      if(!operations.length){const remoto=server.current.db;server.current={...server.current,db:copy(after)};attempt.current=null;pending.current=arquivosPendentes()||JSON.stringify(current.current)!==JSON.stringify(after);setStatus('Dados atualizados');await saveDraft();confirmacoes.current.confirmar(after,remoto,{semAlteracoes:true});if(pending.current)timer.current=setTimeout(flush,500);return;}
      let result=attempt.current.confirmacao;
      if(!result){
        result=await gravarOperacoes(operations,id,after);
        if(gen!==generation.current)return;
        attempt.current.confirmacao=result;
        // Persist the receipt before any read. A reload resumes reconciliation, not the write.
        await saveDraft();
      }
      if(gen!==generation.current) return;
      setStatus('Alterações salvas; atualizando dados…');
      const aliases=result.aliases||{};
      const saved=remap(after,aliases),grupos=gruposDasOperacoes(operations);
      const base=await carregarBase(saved,grupos);
      // The active route may not have selected a municipality (global search).
      // Refresh changed financial customers explicitly before projecting the saved form.
      await atualizarFichas(base,clientesDasOperacoes(remap(operations,aliases),saved.processos),lerFichaCliente);
      if(gen!==generation.current) return;
      await confirmarArquivos(sent,base);
      const state=projetar(base,saved);
      const resultado=await atualizarPreservando(saved,state.db,gen,()=>remap(current.current,aliases));
      if(gen!==generation.current)return;
      attempt.current=null;publish(resultado.dados);
      pending.current=arquivosPendentes()||JSON.stringify(resultado.dados)!==JSON.stringify(state.db);
      server.current=pending.current?{...state,db:resultado.baseline}:state;
      if(resultado.conflitos.length){
        revisao.current={remoto:state.db};setConflitos(resultado.conflitos);
        setError('Há alterações diferentes no mesmo campo. Escolha os valores para continuar.');
        setStatus('Dados atualizados — edições locais aguardando suas escolhas.');
      }else{revisao.current=null;setConflitos([]);setStatus(pending.current?'Salvando próximas alterações…':'Dados compartilhados no Supabase');}
      await saveDraft();
      retentativas.current=0;
      if(resultado.conflitos.length)rejeitarConfirmacoes('A gravação foi recebida, mas há alterações concorrentes para revisar.','CONFLITO_EDICAO');
      else confirmacoes.current.confirmar(after,state.db,result);

      if(pending.current&&!revisao.current) timer.current=setTimeout(flush,500);
    } catch(e) {
      if(gen!==generation.current)return;
      rejeitarConfirmacoes(attempt.current?.confirmacao?'A gravação foi recebida pelo servidor, mas a leitura de confirmação falhou. As alterações continuam preservadas.':`Não foi possível confirmar a gravação: ${e.message}. As alterações continuam no rascunho.`,attempt.current?.confirmacao?'LEITURA_PENDENTE':'CONFIRMACAO_FALHOU',e);
      if(attempt.current&&!attempt.current.confirmacao&&rejeicaoDefinitiva(e)){attempt.current.rejeitada=true;attempt.current.erro=e.message;}
      if((erroConcorrencia(e)||rejeicaoDefinitiva(e))&&attempt.current&&!attempt.current.confirmacao){
        try {
          if(retentativas.current++<3){await conciliar();return;}
          setError(erroConcorrencia(e)?'As alterações continuam concorrentes. Tente novamente para consultar a versão atual.':mensagemRejeicao(e));setStatus('Alterações pendentes — dados locais preservados.');await saveDraft();return;
        }catch(leitura){e=leitura;}
      }
      console.warn('[sincronizacao]',{fase:attempt.current?.confirmacao?'atualizacao':'gravacao',codigo:e.code||e.status||e.name});
      setError(e.message);setStatus(attempt.current?.confirmacao?'Alterações já salvas — aguardando atualização da tela.':'Alterações pendentes — dados locais preservados.');await saveDraft();
      if(falhaTransitoria(e)){clearTimeout(timer.current);timer.current=setTimeout(flush,Math.min(30000,2000*2**Math.min(retentativas.current++,4)));}
    } finally {if(gen===generation.current)busy.current=false;}
  };
  const open=async (user,legacy)=>{
    rejeitarConfirmacoes('A sessão foi reaberta antes da confirmação. Confira a sincronização do rascunho.','SESSAO_ALTERADA');
    vivo.current?.fechar();clearTimeout(avisoTimer.current);avisoTimer.current=null;avisos.current.clear();
    diario.current?.fechar();diario.current=null;setFalhasAtualizacao([]);actor.current=user;generation.current++;server.current=null;municipioAtivo.current=null;desatualizados.current.clear();municipios.current=new Set();setSummaryReady(false);setSummaryError('');opening.current=true;setStatus('Carregando municípios…');setError('');
    const gen=generation.current;busy.current=false;clearTimeout(timer.current);attempt.current=null;revisao.current=null;pending.current=false;current.current=null;municipalityLoads.current.clear();
    try {
    const antigo=usarDiario?await storage.get(`integracao-compartilhado-${user.erpRef}`):null;conferirGeracao(gen);
    if(usarDiario){const d=iniciarDiario(user,gen);await d.migrar(antigo);conferirGeracao(gen);await d.atualizar();conferirGeracao(gen);}
    const cached=await storage.get(storageKey());conferirGeracao(gen);
    let draft=cached?JSON.parse(cached):null;
    if(usarDiario&&!draft&&antigo){try{const original=JSON.parse(antigo);if(original.baseline)draft={...original,db:original.baseline,pending:false,attempt:null};}catch{/* Original already archived for selective review. */}}

    attempt.current=draft?.attempt||null;recuperacoes.current=draft?.recuperacoes||[];setReservasPreservadas(recuperacoes.current.length);
    if(!temSessao()) {
      if(!draft?.base) throw new Error('Entre conectado uma vez para disponibilizar os dados desta conta neste aparelho.');
      await abrirArquivos(user,draft.base,storage);conferirGeracao(gen);
      server.current={...projetar(draft.base,draft.baseline),db:draft.baseline};publish(draft.db);pending.current=!!draft.pending;
      restaurarMunicipios(draft.municipios||[]);setSummaryReady(true);
      setStatus('Modo offline. Entre novamente conectado para enviar as alterações.');
      if(usarDiario){await recuperarArquivosDiario();atualizarDiario(diario.current.itens());publish(diario.current.materializar(server.current.db));}
      return current.current.usuarios.find(u=>u.erpRef===user.erpRef)||user;
    }
    let base;
    try {base=await carregarBase(baseLimpa());}
    catch(e){
      conferirGeracao(gen);
      if(!draft?.base||!draft?.baseline||!falhaTransitoria(e))throw e;
      await abrirArquivos(user,draft.base,storage);conferirGeracao(gen);
      server.current={...projetar(draft.base,draft.baseline),db:draft.baseline};publish(draft.db);
      pending.current=!!draft.pending||!!attempt.current;restaurarMunicipios(draft.municipios||[]);
      setSummaryReady(true);setStatus(attempt.current?.confirmacao?'Alterações já salvas — retomando atualização automaticamente.':'Dados locais disponíveis; retomando a conexão automaticamente.');
      if(pending.current)timer.current=setTimeout(flush,2000);else timer.current=setTimeout(()=>refresh({force:true}),2000);
      iniciarTempoReal();
      if(usarDiario){await recuperarArquivosDiario();atualizarDiario(diario.current.itens());publish(diario.current.materializar(server.current.db));}
      return current.current.usuarios.find(u=>u.erpRef===user.erpRef)||user;
    }
    conferirGeracao(gen);await abrirArquivos(user,base,storage);conferirGeracao(gen);
    if(legacy && !(await storage.get('integracao-antes-compartilhamento'))) await storage.set('integracao-antes-compartilhamento',JSON.stringify(legacy));
    conferirGeracao(gen);const legacyOwner=await storage.get('integracao-dono-base-local');conferirGeracao(gen);
    if(!legacyOwner)await storage.set('integracao-dono-base-local',user.erpRef);
    conferirGeracao(gen);const seed=(!legacyOwner||legacyOwner===user.erpRef?legacy:null) || baseLimpa();
    if(!legacy) {seed.setoresMeta=[];seed.agendas=[];}
    if(draft?.pending&&draft.baseline)await atualizarPendentes(base,draft.baseline,draft.db,draft.attempt);
    const clientesDiario=usarDiario?await hidratarFichasDiario(base,edicoesDiario(),gen,{isolarFalhas:true,anterior:draft?.base}):[];
    conferirGeracao(gen);const state=draft?.pending?projetarRemoto(base,draft.db,draft.baseline):projetar(base,draft?.db||seed);
    if(usarDiario)filtrarFichasDiario(state,clientesDiario);
    // In-flight edits from an earlier session retain their original baseline for conflict checks.
    if(draft?.pending && draft.baseline) {
      restaurarMunicipios(draft.municipios||[...new Set((draft.baseline.processos||[]).filter(p=>!p._resumo).map(p=>p.municipioId))]);
      await storage.set(`${storageKey()}-revisao-recebimento`,JSON.stringify(draft));
      conferirGeracao(gen);const baseline=separarCriacoesPendentes({...state,db:draft.baseline},draft.baseline,attempt.current,user).db;
      const resultado=atualizarComRascunho(baseline,draft.db,state.db);
      server.current={...state,db:resultado.baseline};publish(attempt.current?.rejeitada?preservarRegistrosAusentes(draft.baseline,resultado.dados,state.db):resultado.dados);pending.current=true;
      if(resultado.conflitos.length){revisao.current={remoto:state.db};setConflitos(resultado.conflitos);setError('Há alterações diferentes no mesmo campo. Escolha os valores para continuar.');}
      setStatus('Dados atualizados — alterações locais preservadas.');
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
    if(usarDiario){
      // Local-only entities discovered by the projection become explicit intentions.
      const local=current.current;if(JSON.stringify(local)!==JSON.stringify(server.current.db))await diario.current.adicionar(server.current.db,local,selecionarArquivosDaEdicao(extrairIntencao(server.current.db,local),capturarArquivos()));
      await recuperarArquivosDiario();
      conferirGeracao(gen);await diario.current.atualizar();conferirGeracao(gen);publish(diario.current.materializar(server.current.db));
    }
    await saveDraft();
    conferirGeracao(gen);if(pending.current)timer.current=setTimeout(flush,250);
    setSummaryReady(true);iniciarTempoReal();
    if(usarDiario){atualizarDiario(diario.current.itens());publish(diario.current.materializar(server.current.db));}
      return current.current.usuarios.find(u=>u.erpRef===user.erpRef)||user;
    } finally {if(gen===generation.current)opening.current=false;}
  };
  const loadMunicipio=async(id,cliente=null)=>{
    const individual=!id && cliente;
    const chave=individual ? `cliente:${cliente.id}` : id;
    if(individual && current.current?.processos.some(p=>p.id===cliente.id&&!p._resumo))return current.current;
    if(!individual && municipios.current.has(id) && !desatualizados.current.has(id) && (!cliente || current.current?.processos.some(p=>(p.id===cliente.id||(cliente.financeiroRef&&p.financeiroRef===cliente.financeiroRef))&&!p._resumo)))return current.current;
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
        const merged=usarDiario?state.db:(await atualizarPreservando(prior.db,state.db,gen,()=>attempt.current?.rejeitada?preservarRegistrosAusentes(prior.db,current.current,state.db):current.current)).dados;
        if(gen!==generation.current)throw new Error('Sessão encerrada.');
        server.current=state;publish(usarDiario?diario.current.materializar(state.db):merged);if(!individual){municipios.current.add(id);desatualizados.current.delete(id);}
        await saveDraft();return current.current;
      } finally {if(gen===generation.current){busy.current=false;if(pending.current)timer.current=setTimeout(flush,500);}}
    })();
    municipalityLoads.current.set(chave,job);
    try {return await job;} finally {if(municipalityLoads.current.get(chave)===job)municipalityLoads.current.delete(chave);}
  };
  const mutate=(fn,entry)=>{
    if(!current.current || !server.current) throw new Error('Os dados compartilhados ainda estão carregando.');
    if(!pending.current)retentativas.current=0;
    const next=fn(copy(current.current));
    const previousSummaries=new Map(current.current.processos.filter(p=>p._resumo).map(p=>[p.id,p]));
    for(const p of next.processos||[])if(previousSummaries.has(p.id)){if(JSON.stringify(p)!==JSON.stringify(previousSummaries.get(p.id)))throw new Error('Abra o município antes de alterar este morador.');previousSummaries.delete(p.id);}
    if(previousSummaries.size)throw new Error('Abra o município antes de remover moradores.');
    if(entry)next.auditoria=[entry,...(next.auditoria||[])].slice(0,2000);
    const antes=current.current;publish(next);pending.current=true;setStatus('Guardando alterações neste aparelho…');
    if(usarDiario){const gen=generation.current;diario.current.adicionar(antes,next,selecionarArquivosDaEdicao(extrairIntencao(antes,next),capturarArquivos())).catch(e=>{if(gen===generation.current){setError('Não foi possível guardar a alteração. Baixe uma cópia antes de sair.');setStatus('Alteração ainda não persistida');rejeitarConfirmacoes(e.message,'PERSISTENCIA_LOCAL',e);}});}
    else saveDraft().catch(e=>setError(e.message));
    clearTimeout(timer.current);timer.current=setTimeout(flush,250);
  };
  const mutateConfirmed=async(fn,entry)=>{
    if(!current.current||!server.current||!actor.current||!temSessao())throw erroConfirmacao('Entre em uma sessão conectada para salvar.','SESSAO_ENCERRADA');
    if(!temConexao())throw erroConfirmacao('Conecte-se para salvar. O texto digitado deve permanecer aberto para tentar novamente.','SEM_CONEXAO');
    if(revisao.current)throw erroConfirmacao('Revise as alterações concorrentes antes de salvar.','CONFLITO_EDICAO');
    const antes=copy(current.current);
    const identificada={...(entry||{}),id:entry?.id||crypto.randomUUID()};
    mutate(fn,identificada);
    const gen=generation.current;
    const primeira=confirmacoes.current.aguardar(identificada.id,antes,current.current);
    const acompanhar=async(repetir=false)=>{
      try{
        if(gen!==generation.current||!actor.current||!temSessao())throw erroConfirmacao('A sessão mudou. Reabra o registro para conferir a gravação.','SESSAO_ALTERADA');
        if(repetir&&!confirmacoes.current.confirmada(identificada.id)){
          if(!temConexao())throw erroConfirmacao('Sem conexão para confirmar a tentativa anterior. O rascunho continua preservado.','SEM_CONEXAO');
          if(!pending.current&&!attempt.current)throw erroConfirmacao('A tentativa anterior exige revisão. Confira os dados atuais antes de salvar uma nova alteração.','REVISAO_NECESSARIA');
          clearTimeout(timer.current);timer.current=setTimeout(flush,0);
        }
        return await (repetir?confirmacoes.current.retentar(identificada.id):primeira);
      }catch(e){
        // Retomar a intenção existente nunca reexecuta fn sobre o próprio estado
        // otimista, o que produziria um falso conflito nos editores com CAS.
        const falha=erroConfirmacao(e.message,e.code||'CONFIRMACAO_FALHOU',e);
        falha.retentarConfirmacao=()=>acompanhar(true);
        throw falha;
      }
    };
    return acompanhar();
  };
  const refresh=async({force=false,manual=false,grupos=null}={})=>{
    if(usarDiario){
      if(!actor.current||opening.current||busy.current||!server.current||!temSessao()||!temConexao())return false;
      busy.current=true;const gen=generation.current;
      try{
        await diario.current.atualizar();conferirGeracao(gen);
        const base=await carregarBase(server.current.db,grupos);conferirGeracao(gen);
        const clientes=await hidratarFichasDiario(base,edicoesDiario(),gen,{isolarFalhas:true});
        const state=filtrarFichasDiario(projetarRemoto(base,server.current.db),clientes);
        server.current=state;publish(diario.current.materializar(state.db));await saveDraft();return true;
      }
      catch(e){if(gen===generation.current)setError(e.message);return false;}
      finally{if(gen===generation.current){busy.current=false;if(pending.current)timer.current=setTimeout(flush,250);}}
    }

    if(!force&&Date.now()-lastRefresh.current<120000)return;
    if(manual) {
      if(!temConexao())throw new Error('Conecte-se à internet para atualizar os dados.');
      if(!actor.current||!server.current||!temSessao())throw new Error('Não há conexão autenticada disponível para atualizar os dados.');
      if(opening.current||busy.current)throw new Error('Há uma sincronização em andamento. Aguarde e tente novamente.');
    }
    if(!actor.current||opening.current||!server.current||busy.current||(!manual&&temEdicaoEmAndamento())||!temSessao()||!temConexao()||(!manual&&document.visibilityState==='hidden'))return;
    busy.current=true;const gen=generation.current;
    try {
      const base=await carregarBase(current.current,grupos);
      if(gen!==generation.current)return false;
      if(pending.current&&(!grupos||grupos.includes('clientes')))await atualizarPendentes(base,server.current.db,current.current);
      if(gen!==generation.current||(!manual&&temEdicaoEmAndamento()))return false;
      await abrirArquivos(actor.current,base,storage);
      if(gen!==generation.current||(!manual&&temEdicaoEmAndamento()))return false;
      const state=projetarRemoto(base,current.current);
      if(pending.current){
        // Keep the original request, receipt and local baseline durably recoverable.
        await storage.set(`${storageKey()}-revisao-recebimento`,JSON.stringify({dados:current.current,base:server.current.db,envio:attempt.current,remoto:state.db}));
        if(gen!==generation.current)return false;
        // Recompute after storage: another local action may have arrived meanwhile.
        const resultado=atualizarComRascunho(server.current.db,current.current,state.db);
        server.current={...state,db:resultado.baseline};publish(resultado.dados);
        if(resultado.conflitos.length){
          revisao.current={remoto:state.db};setConflitos(resultado.conflitos);
          setError('Há alterações diferentes no mesmo campo. Escolha os valores para continuar.');
          setStatus('Dados atualizados — edições locais aguardando suas escolhas.');
        }else{
          revisao.current=null;setConflitos([]);
          setStatus('Dados atualizados — alterações locais preservadas.');
        }
      }else{server.current=state;publish(state.db);setStatus('Dados compartilhados no Supabase');setError('');}
      await saveDraft();
    }catch(e){if(gen!==generation.current)return false;setError(e.message);if(manual)throw e;return false;}
    finally{if(gen===generation.current){busy.current=false;if(pending.current&&!revisao.current&&!attempt.current?.rejeitada)timer.current=setTimeout(flush,500);}}
    if(manual)invalidarIndiceClientes();
    return true;
  };
  const close=()=>{rejeitarConfirmacoes('A sessão terminou antes da confirmação. O rascunho permanece preservado.','SESSAO_ENCERRADA');vivo.current?.fechar();vivo.current=null;clearTimeout(avisoTimer.current);avisoTimer.current=null;avisos.current.clear();saveDraft().catch(()=>{});generation.current++;busy.current=false;opening.current=false;clearTimeout(timer.current);fecharArquivos();summaryJob.current=null;municipalityLoads.current.clear();actor.current=null;diario.current?.fechar();diario.current=null;setFalhasAtualizacao([]);setPendencias([]);setPreviaPendencia(null);server.current=null;current.current=null;pending.current=false;revisao.current=null;setConflitos([]);retentativas.current=0;definirSessao(null);setStatus('');setError('');};
  const reopen=async()=>{
    const gen=generation.current;
    try {
      if(!actor.current||!current.current)throw Error('Abra a conta que contém as pendências antes de exportar.');
      const chave=storageKey(),d=diario.current,conta=actor.current.erpRef;
      // Capture local state and queued bytes before awaiting IndexedDB. Export
      // remains available during a send and cannot mix another account's data.
      const conteudo=copy({dados:current.current,base:server.current?.db,envio:attempt.current,reservasPreservadas:recuperacoes.current,arquivosPendentes:capturarArquivos()});
      conteudo.diario=usarDiario?await d.exportar():undefined;conferirGeracao(gen);
      conteudo.recuperacaoAnexosMetas=await recuperarAnexosMetas({diario:conteudo.diario,envio:conteudo.envio,conta,storage,conferir:()=>conferirGeracao(gen)});conferirGeracao(gen);
      const resultado=await exportarCopiaRecuperacao({conteudo:JSON.stringify(conteudo,null,2),baixar:snapshot=>{
        conferirGeracao(gen);const url=URL.createObjectURL(new Blob([snapshot],{type:'application/json'}));
        try{const a=document.createElement('a');a.href=url;a.download='integracao-rascunho-preservado.json';a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
      },preservar:async snapshot=>{conferirGeracao(gen);await storage.set(`${chave}-revisao-${Date.now()}`,snapshot);conferirGeracao(gen);await saveDraft();}});
      conferirGeracao(gen);
      const parcial=!conteudo.recuperacaoAnexosMetas.completa;
      setStatus(parcial?'Cópia parcial enviada para download; as pendências continuam preservadas.':'Cópia enviada para download. Confira o arquivo antes de fechar a tela; as pendências continuam preservadas.');
      const avisos=[];
      if(parcial)avisos.push(`${conteudo.recuperacaoAnexosMetas.ausentes.length} anexo(s) de Metas não puderam ser incluídos. Preserve este aparelho e revise os arquivos indicados na cópia antes de fechar a tela.`);
      if(!resultado.copiaInterna)avisos.push('A cópia interna do navegador não pôde ser atualizada. Confirme o download antes de fechar esta tela.');
      if(avisos.length)setError(avisos.join(' '));
    }catch(e){if(gen===generation.current)setError(e.message);}
  };
  useEffect(()=>{
    const tick=setInterval(refresh,120000);
    const online=()=>{if(!actor.current)return;if(temConexao()){if(!vivo.current)iniciarTempoReal();else vivo.current.reconectar();if(pending.current)flush();avisar(null);}else{vivo.current?.fechar();vivo.current=null;setTempoReal('offline');}};
    const foco=()=>{if(actor.current&&document.visibilityState!=='hidden'){if(pending.current)flush();avisar(null);}};
    const filePending=evento=>{if(!actor.current)return;if(usarDiario&&current.current){const gen=generation.current;diario.current.adicionarArquivos(current.current,evento.detail?.arquivos||capturarArquivos()).catch(e=>{if(gen===generation.current)setError(e.message);});}pending.current=true;setStatus('Arquivos aguardando gravação no Supabase');clearTimeout(timer.current);timer.current=setTimeout(flush,250);};
    const protegerSaida=e=>{if(pending.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',protegerSaida);
    window.addEventListener('integracao:arquivo-pendente',filePending);
    window.addEventListener('integracao:conexao',online);window.addEventListener('online',online);window.addEventListener('offline',online);window.addEventListener('focus',foco);window.addEventListener('visibilitychange',foco);
    return()=>{generation.current++;diario.current?.fechar();rejeitarConfirmacoes('A tela de sincronização foi encerrada antes da confirmação.','TELA_ENCERRADA');vivo.current?.fechar();clearTimeout(avisoTimer.current);window.removeEventListener('offline',online);window.removeEventListener('visibilitychange',foco);window.removeEventListener('beforeunload',protegerSaida);clearInterval(tick);clearTimeout(timer.current);window.removeEventListener('integracao:arquivo-pendente',filePending);window.removeEventListener('integracao:conexao',online);window.removeEventListener('online',online);window.removeEventListener('focus',foco);};
  },[]);
  const abrirPendencia=async id=>{const gen=generation.current;try{const previa=await diario.current.previa(id);conferirGeracao(gen);setPreviaPendencia(previa);}catch(e){if(gen===generation.current)setError(e.message);}};
  const resolverPendencia=async escolhas=>{const gen=generation.current;try{await diario.current.resolver(previaPendencia.id,escolhas);conferirGeracao(gen);setPreviaPendencia(null);await flush();}catch(e){if(gen===generation.current)setError(e.message);}};
  const reconhecerPendencia=async()=>{const gen=generation.current;try{const d=diario.current;await d.reconhecerLeitura(previaPendencia.id);conferirGeracao(gen);setPreviaPendencia(null);publish(d.materializar(server.current.db));await saveDraft();await flush();}catch(e){if(gen===generation.current)setError(e.message);}};
  const descartarPendencia=async()=>{const gen=generation.current;try{const d=diario.current;await d.descartar(previaPendencia.id);conferirGeracao(gen);setPreviaPendencia(null);publish(d.materializar(server.current.db));await saveDraft();conferirGeracao(gen);await flush();}catch(e){if(gen===generation.current)setError(e.message);}};
  const tentarNovamente=async()=>{const gen=generation.current;retentativas.current=0;if(usarDiario&&diario.current){try{await diario.current.retomarAutomaticas();conferirGeracao(gen);}catch(e){if(gen===generation.current)setError(e.message);return;}}return flush();};
  const diagnosticarPendencia=id=>{const itens=diario.current?.itens()||[],item=itens.find(i=>i.id===id);return item?diagnosticoOperacao(item,Date.now(),itens):null;};
  const executarSuporte=async({tipo,pedido=null},conferirComando=()=>{},revalidar=async()=>{})=>{
    const gen=generation.current,d=diario.current;
    const verificar=()=>{conferirGeracao(gen);try{conferirComando();}catch{throw Object.assign(Error('Solicitação de suporte interrompida.'),{code:'SESSAO_ALTERADA'});}};
    const validar=async()=>{verificar();try{await revalidar();}catch{throw Object.assign(Error('Solicitação de suporte interrompida.'),{code:'SESSAO_ALTERADA'});}verificar();};
    const resultado=codigo=>({codigo,itens:diagnosticosSuporte(d?.itens()||[],pedido)});
    verificar();
    if(!usarDiario||!d||opening.current||!server.current||!temSessao())return resultado('EM_ANDAMENTO');
    if(busy.current||temEdicaoEmAndamento())return resultado('EM_ANDAMENTO');
    busy.current=true;clearTimeout(timer.current);
    try{
      await d.esperar();verificar();await d.atualizar();verificar();
      const alvo=pedido?d.itens().find(i=>i.id===pedido):null;
      if(pedido&&!alvo)return resultado('PEDIDO_AUSENTE');
      if(['diagnostico','revisar_bloqueios'].includes(tipo))return resultado('DIAGNOSTICO');
      if(tipo==='solicitar_atualizacao')return resultado('ATUALIZACAO_SOLICITADA');
      if(['consultar_recibo','reler_confirmacao'].includes(tipo)){
        if(!pedido||!alvo?.payload||tipo==='reler_confirmacao'&&!alvo.recibo)return resultado('REVISAO_NECESSARIA');
        const lido=await d.consultarExistente(pedido,{modo:tipo==='consultar_recibo'?'consulta':'releitura',validar,verificar});verificar();
        publish(d.materializar(server.current.db));await saveDraft();verificar();
        return resultado(!lido?'EM_ANDAMENTO':tipo==='reler_confirmacao'?'LEITURA_CONFIRMADA':lido.recibo?alvo.recibo?'RECIBO_LOCAL':'RECIBO_ENCONTRADO':'SEM_RECIBO');
      }
      if(tipo!=='retomar_automaticas')return resultado('REVISAO_NECESSARIA');
      if(alvo&&(alvo.estado.startsWith('bloqueado')||['persistencia_falhou','legado_revisao'].includes(alvo.estado)))return resultado('REVISAO_NECESSARIA');
      const aptos=d.itens().filter(i=>(!pedido||i.id===pedido)&&!['confirmado','substituido','dispensado','persistencia_falhou','legado_revisao'].includes(i.estado)&&!i.estado.startsWith('bloqueado')).map(i=>i.id);
      if(!aptos.length)return resultado('SEM_ALTERACAO');
      await validar();await d.retomarAutomaticas({id:pedido});verificar();
      await d.executar({id:pedido,validar,verificar});verificar();
      publish(d.materializar(server.current.db));await saveDraft();verificar();
      const depois=d.itens().filter(i=>aptos.includes(i.id));
      return resultado(depois.some(i=>i.erro?.codigo==='LEITURA_DIVERGENTE')?'LEITURA_DIVERGENTE':depois.some(i=>i.estado.startsWith('bloqueado'))?'REVISAO_NECESSARIA':depois.length&&depois.every(i=>i.estado==='confirmado')?'LEITURA_CONFIRMADA':'EM_ANDAMENTO');
    }catch(e){
      if(e.code==='SESSAO_ALTERADA'||gen!==generation.current)throw e;
      if(e.code==='LEITURA_DIVERGENTE')return resultado('LEITURA_DIVERGENTE');
      return resultado(e.code==='ARQUIVO_LOCAL_AUSENTE'?'ARQUIVO_LOCAL_AUSENTE':e.status===403?'REVISAO_NECESSARIA':'RESULTADO_INCERTO');
    }finally{if(gen===generation.current){busy.current=false;if(pending.current){clearTimeout(timer.current);timer.current=setTimeout(flush,3000);}}}
  };
  const prepararAtualizacaoSuporte=async()=>{
    const gen=generation.current,d=diario.current,conta=actor.current?.erpRef;
    if(!conta||!d||busy.current||opening.current||!current.current||!server.current)return false;
    const seguro=()=>gen===generation.current&&actor.current?.erpRef===conta&&!opening.current&&!temEdicaoEmAndamento()&&!edicaoVisivelParaAtualizar()&&!arquivosPendentes()&&!d.itens().some(i=>!['confirmado','substituido','dispensado'].includes(i.estado));
    busy.current=true;
    try{
      await d.esperar();conferirGeracao(gen);await d.atualizar();conferirGeracao(gen);if(!seguro())return false;
      const diarioPreservado=await d.exportar();conferirGeracao(gen);
      return await prepararRecuperacaoAtualizacao({conta,storage,snapshot:()=>({protocolo:1,conta,dados:current.current,base:server.current,diario:diarioPreservado}),seguro,conferir:()=>conferirGeracao(gen),esperar:async()=>{await d.esperar();await saveDraft();}});
    }catch{return false;}finally{if(gen===generation.current){busy.current=false;if(pending.current){clearTimeout(timer.current);timer.current=setTimeout(flush,3000);}}}
  };
  return {executarSuporte,prepararAtualizacaoSuporte,diagnosticarPendencia,falhasAtualizacao,diagnosticoPronto:()=>!!diario.current&&!opening.current&&!!server.current,pendencias,previaPendencia,abrirPendencia,resolverPendencia,reconhecerPendencia,descartarPendencia,fecharPrevia:()=>setPreviaPendencia(null),definirMunicipioAtivo:id=>{municipioAtivo.current=id;},open,mutate,mutateConfirmed,close,flush:tentarNovamente,refresh,reopen,loadMunicipio,status,error,reservasPreservadas,conflitos,resolverConflitos,summaryReady,summaryError,tempoReal,salvamentoConfirmado:!!attempt.current?.confirmacao,ready:()=>!!server.current};
}
