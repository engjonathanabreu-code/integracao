// Só esta página de teste carrega o bridge. O App de produção permanece intacto.
const nativeFetch = window.fetch.bind(window);
const perfil = new URLSearchParams(location.search).get('qaPerfil') || 'Projetos';
const endpoint = 'http://127.0.0.1:4179';
const inicial = await nativeFetch(`${endpoint}/qa/base?perfil=${encodeURIComponent(perfil)}`).then(async r => { if (!r.ok) throw Error(await r.text()); return r.json(); });
const rpcs = new Set(['integracao_documentos_observacoes_operar', 'integracao_termos_operar', 'integracao_qualificacoes_nucleo', 'integracao_gravar', 'integracao_oficio_reservar_numero']);
let ultimaRevisao = JSON.stringify(inicial.base.integracao_revisoes);
function avisarRevisao() {
  const registro = window.baseFixture?.integracao_revisoes?.find(r => r.modulo === 'clientes');
  const socket = window.socketFixture;
  if (registro && socket) socket.onmessage?.({ data: JSON.stringify({ topic: socket.topic, event: 'postgres_changes', payload: { data: { record: registro } } }) });
}
let fetchAtual = nativeFetch;
// A fixture existente instala seu fetch antes de importar o App. Interceptamos
// esse ponto para que o primeiro carregamento já receba os mesmos IDs do SQL.
Object.defineProperty(window, 'fetch', { configurable: true, get: () => fetchAtual, set(mockFetch) {
  Object.assign(window.baseFixture, inicial.base);
  fetchAtual = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const nome = url.pathname.split('/').pop();
    if (url.pathname.includes('/rpc/') && rpcs.has(nome)) {
      if (window.qaFalhaRede) throw new TypeError('Falha de rede simulada no ambiente isolado');
      const resposta = await nativeFetch(`${endpoint}/qa/rpc/${nome}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QA-Perfil': perfil }, body: options.body });
      if (resposta.ok && JSON.parse(options.body || '{}').p_acao !== 'listar') {
        const atual = await nativeFetch(`${endpoint}/qa/base?perfil=${encodeURIComponent(perfil)}`).then(r => r.json());
        Object.assign(window.baseFixture, atual.base);
        ultimaRevisao = JSON.stringify(atual.base.integracao_revisoes);
        setTimeout(avisarRevisao, 50);
      }
      return resposta;
    }
    return mockFetch(input, options);
  };
} });
await import('./browser-fixture.js');
Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: fetchAtual });
const controles = document.createElement('aside');
controles.setAttribute('aria-label', 'Controles exclusivos de QA');
controles.style.cssText = 'position:fixed;bottom:0;left:0;z-index:100000;background:#fff7df;color:#282018;padding:5px 8px;border:1px solid #c9a546;font:12px system-ui;display:flex;gap:8px;align-items:center';
const label = document.createElement('strong'); label.textContent = 'QA local · dados fictícios'; controles.append(label);
const seletor = document.createElement('select'); seletor.setAttribute('aria-label', 'Perfil QA');
for (const nome of ['Projetos', 'Topografia', 'Administrador', 'Consulta', 'Outro Projetos', 'Financeiro', 'Externo', 'Inativo']) { const op = new Option(nome, nome, nome === perfil, nome === perfil); seletor.add(op); }
seletor.onchange = () => { const url = new URL(location.href); url.searchParams.set('qaPerfil', seletor.value); location.assign(url); };
controles.append(seletor);
const falha = document.createElement('label'); const check = document.createElement('input'); check.type = 'checkbox'; check.onchange = () => { window.qaFalhaRede = check.checked; }; falha.append(check, ' Falhar rede RPC'); controles.append(falha);
document.body.append(controles);
window.qaProjetosDocumentos = { perfil, ids: inicial.ids, backend: endpoint };
// Simula apenas o transporte do aviso realtime: os registros e a versão são
// lidos do banco real, permitindo que outra sessão veja a gravação confirmada.
setInterval(async () => {
  try {
    const resposta = await nativeFetch(`${endpoint}/qa/base?perfil=${encodeURIComponent(perfil)}`);
    if (!resposta.ok) return;
    const atual = await resposta.json();
    const revisao = JSON.stringify(atual.base.integracao_revisoes);
    if (revisao !== ultimaRevisao) { ultimaRevisao = revisao; Object.assign(window.baseFixture, atual.base); avisarRevisao(); }
  } catch { /* Reconexão tentada no próximo ciclo, sem tocar no rascunho. */ }
}, 3000);
