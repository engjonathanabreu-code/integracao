import {COLUNAS_FINANCEIRAS,codificarNumeroFinanceiro,projetarNumeroFinanceiro} from './contrato-financeiro.js';
import {remapearIdentidades as remapear} from './aliases-tipados.js';
import {igualSemantico as igual} from './igualdade-semantica.js';
// Observa o pipeline existente; não grava, repete ou concilia mutações.
// A auditoria identifica o snapshot enviado, e os campos alterados são conferidos
// contra a leitura feita depois do recibo. Edições posteriores aguardam outro lote.
const possui = (obj, chave) => Object.prototype.hasOwnProperty.call(obj || {}, chave);
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const listaPorId = v => Array.isArray(v) && v.every(x => objeto(x) && x.id != null) && new Set(v.map(x => String(x.id))).size === v.length;
const copiar = v => v === undefined ? undefined : structuredClone(v);

function diferencas(antes, depois, caminho = [], saida = []) {
  if (igual(antes, depois)) return saida;
  if (listaPorId(antes) && listaPorId(depois)) {
    const a = new Map(antes.map(x => [String(x.id), x])), b = new Map(depois.map(x => [String(x.id), x]));
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const path = [...caminho, { id }];
      if (!b.has(id)) saida.push({ caminho: path, existe: false });
      else if (!a.has(id)) saida.push({ caminho: path, existe: true, valor: copiar(b.get(id)), parcial: true });
      else diferencas(a.get(id), b.get(id), path, saida);
    }
  } else if (objeto(antes) && objeto(depois)) {
    for (const chave of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
      if (!caminho.length && chave === 'auditoria') continue;
      const path = [...caminho, chave];
      if (!possui(depois, chave)) saida.push({ caminho: path, existe: false });
      else if (!possui(antes, chave)) saida.push({ caminho: path, existe: true, valor: copiar(depois[chave]), parcial: objeto(depois[chave]) });
      else diferencas(antes[chave], depois[chave], path, saida);
    }
  } else saida.push({ caminho, existe: true, valor: copiar(depois), parcial: false });
  return saida;
}

function lerCaminho(raiz, caminho, aliases) {
  let valor = raiz;
  for (const [indice,parte] of caminho.entries()) {
    if (typeof parte === 'object') {
      const id = aliases[parte.id] || parte.id;
      if (!Array.isArray(valor)) return { existe: false };
      const achado = valor.find(x => String(x?.id) === String(id));
      if (!achado) return { existe: false };
      valor = achado;
    } else {
      const chave = ['lidaPor','ultimaLeitura','respostas'].includes(caminho[indice-1]) ? aliases[parte] || parte : parte;
      if (!possui(valor, chave)) return { existe: false };
      valor = valor[chave];
    }
  }
  return { existe: true, valor };
}

function contem(atual, esperado) {
  if (objeto(esperado)) return objeto(atual) && Object.keys(esperado).every(k => contem(atual[k], esperado[k]));
  return igual(atual, esperado);
}

function instanteChecklist(valor) {
  const iso=typeof valor==='string'&&valor.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/);
  // A date without timezone is not proof of an instant. Keep submillisecond
  // differences meaningful rather than accepting Date.parse's truncation.
  if(!iso||Number(iso[2])>23||Number(iso[3])>59||Number(iso[4])>59||/[1-9]/.test(iso[5]?.slice(3)||''))return NaN;
  const instante=Date.parse(valor);
  return Number.isFinite(instante)&&new Date(iso[1]+'T00:00:00Z').toISOString().slice(0,10)===iso[1]?instante:NaN;
}

function mesmosResponsaveis(atual, esperado) {
  const valido=lista=>Array.isArray(lista)&&lista.every(id=>typeof id==='string'&&/^(?:erp_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))&&new Set(lista).size===lista.length;
  if(!valido(atual)||!valido(esperado)||atual.length!==esperado.length)return false;
  const ids=new Set(atual);return esperado.every(id=>ids.has(id));
}

function conferir(mudancas, remoto, aliases = {}, operacoes = []) {
  return mudancas.every(mudanca => {
    // Presence is device-local; it is deliberately not written by prepararEdicao.
    if(mudanca.caminho[0]==='usuarios'&&mudanca.caminho.length===3&&['online','ultimaAtividade'].includes(mudanca.caminho[2]))return true;
    const atual = lerCaminho(remoto, mudanca.caminho, aliases);
    if (!mudanca.existe) return !atual.existe;
    const campo=mudanca.caminho.at(-1);
    if(mudanca.caminho[0]==='metas'&&mudanca.caminho.length===5&&mudanca.caminho[2]==='checklist'&&campo==='concluido_em'){
      const id=aliases[mudanca.caminho[3].id]||mudanca.caminho[3].id;
      const op=operacoes.find(o=>o.table==='meta_checklist'&&!o.action&&!o.insert&&!o.remove&&(aliases[o.key?.id]||o.key?.id)===id&&possui(o.changes,campo));
      // Reopening clears the form with '', which this column's encoder sends
      // as NULL. Require the explicit reopen operation and the reopened row.
      if(op&&mudanca.valor===''&&op.changes[campo]===null&&op.changes.concluido===false&&atual.existe&&atual.valor===null&&lerCaminho(remoto,mudanca.caminho.slice(0,4),aliases).valor?.concluido===false)return true;
      const instante=instanteChecklist(mudanca.valor);
      // Only this row's submitted completion time may use the equivalent ISO
      // representation returned by PostgreSQL. Every other field stays exact.
      if(op&&op.changes[campo]===mudanca.valor&&Number.isFinite(instante))return atual.existe&&instante===instanteChecklist(atual.valor);
    }
    // Only timestamp columns actually submitted to the calendar contract accept
    // equivalent ISO offsets. Dates, text and unrelated paths stay exact.
    if(mudanca.caminho[0]==='eventos'&&mudanca.caminho.length===3&&['inicio','fim'].includes(campo)){
      const id=aliases[mudanca.caminho[1].id]||mudanca.caminho[1].id;
      const op=operacoes.find(o=>o.table==='erp_eventos'&&o.key?.id===id&&possui(o.changes,campo));
      const instante=typeof mudanca.valor==='string'?Date.parse(mudanca.valor):NaN;
      if(op&&Number.isFinite(instante)&&op.changes[campo]===new Date(instante).toISOString())return atual.existe&&instante===Date.parse(atual.valor);
    }
    let esperado = remapear(mudanca.valor, aliases,typeof campo==='string'?campo:'');
    // Goal responsibilities are membership rows; their SELECT order carries
    // no user intent. Never generalize this to ordered lists or invalid IDs.
    if(mudanca.caminho[0]==='metas'&&mudanca.caminho.length===3&&typeof mudanca.caminho[1]==='object'&&campo==='responsaveis')return atual.existe&&mesmosResponsaveis(atual.valor,esperado);
    if(mudanca.caminho[0]==='nucleos'&&mudanca.caminho.length===3&&['etapaIniciadaEm','etapaPrefeituraIniciadaEm'].includes(campo)&&typeof esperado==='string'&&typeof atual.valor==='string'){
      const instante=Date.parse(esperado);
      if(Number.isFinite(instante)&&instante===Date.parse(atual.valor))return true;
    }
    // Financial inputs are encoded as numbers and projected back without
    // insignificant decimal zeroes. Confirm only the exact submitted column
    // for this canonical client, never coerce arbitrary fields or other rows.
    if(mudanca.caminho.length===4&&mudanca.caminho[0]==='processos'&&mudanca.caminho[2]==='comercial'){
      const coluna=COLUNAS_FINANCEIRAS[campo],registro=lerCaminho(remoto,mudanca.caminho.slice(0,2),aliases).valor;
      const id=registro?.financeiroRef||registro?.id;
      const op=coluna&&operacoes.find(o=>o.table==='fin_receb_clientes'&&o.key?.id===id&&!o.remove&&possui(o.changes,coluna));
      if(op){
        const numero=codificarNumeroFinanceiro(campo,esperado);
        if((numero===null||Number.isFinite(numero))&&op.changes[coluna]===numero){
          const canonico=projetarNumeroFinanceiro(numero);
          return atual.existe&&atual.valor===canonico;
        }
      }
    }
    const [colecao,,filhos]=mudanca.caminho;
    if(colecao==='eventos'&&mudanca.parcial&&mudanca.caminho.length===2&&atual.valor?.id===esperado?.id){
      const op=operacoes.find(o=>o.action==='evento'&&(aliases[o.tempId]||o.tempId)===atual.valor.id);
      if(op?.payload){
        esperado={...esperado};
        // The form uses local wall time; the operation and PostgreSQL return
        // canonical instants. Accept only the exact instant in this request.
        for(const k of ['inicio','fim']){
          const enviado=Date.parse(op.payload[k]);
          if(Number.isFinite(enviado)&&Date.parse(esperado[k])===enviado&&Date.parse(atual.valor[k])===enviado)esperado[k]=atual.valor[k];
        }
        // Creation does not transmit the form's default swatch. The ERP
        // assigns that color; custom choices and explicit color writes remain
        // reviewable rather than being silently reported as saved.
        const corExplicita=operacoes.some(o=>o.action==='evento_cor'&&(aliases[o.payload?.id]||o.payload?.id)===atual.valor.id||o.table==='erp_eventos'&&o.key?.id===atual.valor.id&&possui(o.changes||{},'cor'));
        if(esperado.cor==='#0F5F5B'&&!possui(op.payload,'cor')&&!corExplicita&&/^#[0-9a-f]{6}$/i.test(atual.valor.cor))esperado.cor=atual.valor.cor;
        // An empty recurrence end on a one-off form is not a persisted date.
        // Nonempty dates, recurring requests and every business field stay strict.
        if(esperado.recorrencia==='nenhuma'&&esperado.recorrenciaAte===''&&op.payload.recorrencia==='nenhuma'&&op.payload.repetir_ate==null&&atual.valor.recorrencia==='nenhuma')delete esperado.recorrenciaAte;
      }
    }
    if(mudanca.parcial&&mudanca.caminho.length===4&&typeof campo==='object'){
      const historicoGerado=(colecao==='nucleos'&&filhos==='historicoEtapas')||(colecao==='metas'&&['historico','comentarios'].includes(filhos));
      // These inserts use created_at DEFAULT now(), not the UI clock. Still
      // require a server timestamp and all submitted business/author fields.
      if(historicoGerado){
        if(!atual.valor?.data||!Number.isFinite(Date.parse(atual.valor.data)))return false;
        esperado={...esperado};delete esperado.data;
      }
      // The ERP column stores only the calendar date; author remains in its complement.
      if(colecao==='nucleos'&&filhos==='andamentos')esperado={...esperado,data:String(esperado.data||'').slice(0,10)};
    }
    if(mudanca.parcial&&mudanca.caminho[0]==='eventos'&&mudanca.caminho.length===2&&objeto(esperado)){
      const op=operacoes.find(o=>o.action==='evento'&&(aliases[o.tempId]||o.tempId)===esperado.id);
      if(op){
        esperado={...esperado};
        for(const coluna of ['inicio','fim']){
          const instante=typeof esperado[coluna]==='string'?Date.parse(esperado[coluna]):NaN;
          if(Number.isFinite(instante)&&op.payload?.[coluna]===new Date(instante).toISOString()&&instante===Date.parse(atual.valor?.[coluna]))esperado[coluna]=atual.valor[coluna];
        }
      }
    }
    // New municipality/remittance/nucleus records acquire this read-only ERP
    // marker after insertion. Only accept the exact known transition; keep all
    // submitted business fields and any nonempty provenance subject to checks.
    if(mudanca.parcial&&mudanca.caminho.length===2&&['municipios','remessas','nucleos'].includes(colecao)&&Array.isArray(esperado?.origem)&&esperado.origem.length===0&&atual.valor?._compartilhado===true&&igual(atual.valor.origem,['ERP']))esperado={...esperado,origem:['ERP']};
    if(mudanca.parcial&&mudanca.caminho.length===4&&colecao==='metas'&&filhos==='arquivos'&&typeof esperado?.chave==='string'&&!esperado.chave.startsWith('erp-storage|')){
      const metaId=aliases[mudanca.caminho[1].id]||mudanca.caminho[1].id;
      const op=operacoes.find(o=>o.table==='meta_arquivos'&&o.insert&&o.key?.id===esperado.id&&o.changes?.meta_id===metaId),d=op?.changes;
      if(!d||d.nome!==esperado.nome||d.mime_type!==esperado.tipo||Number(d.tamanho_bytes)!==Number(esperado.tamanho)||!atual.valor?.data||!Number.isFinite(Date.parse(atual.valor.data)))return false;
      esperado={...esperado,chave:`erp-storage|documentos|${d.caminho_storage}`,data:atual.valor.data};
    }
    // The same child insert rules apply when the parent itself was just created.
    // Match child identities, never positions; preserve all business comparisons.
    if(mudanca.parcial&&mudanca.caminho.length===2&&objeto(esperado)){
      const filhosNovos=colecao==='metas'?['historico','comentarios','arquivos']:colecao==='nucleos'?['historicoEtapas','andamentos']:[];
      esperado={...esperado};
      for(const filho of filhosNovos)if(listaPorId(esperado[filho])){
        if(!conferir(diferencas([],esperado[filho],[...mudanca.caminho,filho]),remoto,aliases,operacoes))return false;
        delete esperado[filho];
      }
    }
    if(mudanca.parcial&&mudanca.caminho[0]==='metas'&&mudanca.caminho.length===2&&typeof mudanca.caminho[1]==='object'&&objeto(esperado)&&possui(esperado,'responsaveis')){
      if(!mesmosResponsaveis(atual.valor?.responsaveis,esperado.responsaveis))return false;
      esperado={...esperado};delete esperado.responsaveis;
    }
    // New canonical goals receive their ERP binding on projection. Accept only
    // that exact binding; business nulls and any different identity still differ.
    if(mudanca.parcial&&mudanca.caminho[0]==='metas'&&mudanca.caminho.length===2&&esperado?.erpId==null&&atual.valor?.erpId===atual.valor?.id&&atual.valor?.id===esperado?.id){
      esperado={...esperado,erpId:atual.valor.erpId};
      if(esperado._compartilhado===undefined)delete esperado._compartilhado;
    }
    return atual.existe && (mudanca.parcial ? contem(atual.valor, esperado) : igual(atual.valor, esperado));
  });
}

export function alteracoesConfirmadas(antes, depois, remoto, aliases = {}, operacoes = []) {
  return conferir(diferencas(antes, depois), remoto, aliases, operacoes);
}

// A receipt may be followed by a different authorized read, including the old
// base value or a removed record. Three-way merge conflicts alone miss those
// cases. Reuse the exact confirmation contract, including canonical adapters.
export function divergenciasConfirmacao(antes, depois, remoto, aliases = {}, operacoes = []) {
  return diferencas(antes, depois).filter(m => !conferir([m], remoto, aliases, operacoes)).map(m => ({
    caminho: m.caminho.map(p => typeof p === 'object' ? aliases[p.id] || p.id : p),
    base: lerCaminho(antes, m.caminho, {}).valor,
    local: m.existe ? copiar(m.valor) : undefined,
    remoto: copiar(lerCaminho(remoto, m.caminho, aliases).valor),
  }));
}

export function erroConfirmacao(mensagem, codigo = 'CONFIRMACAO_PENDENTE', causa) {
  const erro = new Error(mensagem, causa ? { cause: causa } : undefined);
  erro.code = codigo;
  erro.rascunhoPreservado = true;
  return erro;
}

export function criarConfirmacoesMutacoes({ timeout = 45000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const pendentes = new Map(), registros = new Map();
  const concluir = (id, erro, resultado) => {
    const registro = registros.get(id);
    if (registro) {
      registro.erro = erro;
      registro.resultado = resultado;
      if (!erro) registro.mudancas = null;
    }
    const item = pendentes.get(id);
    if (!item) return;
    pendentes.delete(id); clearTimer(item.timer);
    if (erro) item.reject(erro); else item.resolve(resultado);
  };
  const esperar = id => {
    if (pendentes.has(id)) return pendentes.get(id).promessa;
    const registro = registros.get(id);
    if (!registro) return Promise.reject(erroConfirmacao('Esta tentativa não está mais disponível. Confira a sincronização e reabra o registro antes de continuar.', 'CONFIRMACAO_EXPIRADA'));
    if (registro.resultado) return Promise.resolve(registro.resultado);
    let resolve, reject;
    const promessa = new Promise((ok, falha) => { resolve = ok; reject = falha; });
    const item = { resolve, reject, promessa };
    pendentes.set(id, item);
    item.timer = setTimer(() => concluir(id, erroConfirmacao('Ainda não foi possível confirmar a gravação. As alterações continuam preservadas; confira a sincronização antes de tentar novamente.', 'CONFIRMACAO_TIMEOUT')), timeout);
    return promessa;
  };
  return {
    aguardar(id, antes, depois) {
      if (!id) throw new Error('A confirmação precisa de um identificador de operação.');
      if (registros.has(id)) throw new Error('Esta operação já foi registrada. Retome a confirmação existente.');
      registros.set(id, { mudancas: diferencas(antes, depois) });
      for (const chave of registros.keys()) {
        if (registros.size <= 32) break;
        if (chave !== id && !pendentes.has(chave)) registros.delete(chave);
      }
      return esperar(id);
    },
    retentar: esperar,
    confirmada: id => !!registros.get(id)?.resultado,
    confirmar(enviado, remoto, recibo = {}) {
      const ids = new Set((enviado?.auditoria || []).map(x => x.id));
      for (const [id, item] of registros) {
        if (!ids.has(id) || item.resultado) continue;
        if (!conferir(item.mudancas, remoto, recibo.aliases || {}, recibo.operacoes || [])) {
          concluir(id, erroConfirmacao('A leitura do servidor não confirmou todos os campos desta alteração. O rascunho foi preservado; confira a sincronização antes de continuar.', 'LEITURA_DIVERGENTE'));
        } else concluir(id, null, { confirmado: true, id, recibo });
      }
    },
    falhar(erro) {
      for (const id of [...pendentes.keys()]) concluir(id, erro);
    },
    get tamanho() { return pendentes.size; },
  };
}
