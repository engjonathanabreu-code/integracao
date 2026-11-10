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

function conferir(mudancas, remoto, aliases = {}) {
  return mudancas.every(mudanca => {
    const atual = lerCaminho(remoto, mudanca.caminho, aliases);
    if (!mudanca.existe) return !atual.existe;
    const campo=mudanca.caminho.at(-1);
    let esperado = remapear(mudanca.valor, aliases,typeof campo==='string'?campo:'');
    // New canonical goals receive their ERP binding on projection. Accept only
    // that exact binding; business nulls and any different identity still differ.
    if(mudanca.parcial&&mudanca.caminho[0]==='metas'&&mudanca.caminho.length===2&&esperado?.erpId==null&&atual.valor?.erpId===atual.valor?.id&&atual.valor?.id===esperado?.id){
      esperado={...esperado,erpId:atual.valor.erpId};
      if(esperado._compartilhado===undefined)delete esperado._compartilhado;
    }
    return atual.existe && (mudanca.parcial ? contem(atual.valor, esperado) : igual(atual.valor, esperado));
  });
}

export function alteracoesConfirmadas(antes, depois, remoto, aliases = {}) {
  return conferir(diferencas(antes, depois), remoto, aliases);
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
        if (!conferir(item.mudancas, remoto, recibo.aliases || {})) {
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
