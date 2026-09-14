// Guarda os dados no próprio navegador (IndexedDB), com a mesma interface usada pelo protótipo.
// Cada aparelho tem os seus dados: nada é compartilhado entre pessoas nesta versão de teste.
const BANCO = "integracao";
const LOJA = "chaves";
let conexao = null;

function abrirBanco() {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

async function operar(modo, fn) {
  if (!conexao) conexao = abrirBanco();
  const db = await conexao;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOJA, modo);
    const pedido = fn(tx.objectStore(LOJA));
    tx.oncomplete = () => resolve(pedido ? pedido.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("gravação cancelada pelo navegador"));
  });
}

export function instalarArmazenamento() {
  if (typeof window === "undefined" || window.storage) return;
  const temIndexedDB = typeof indexedDB !== "undefined";
  const ls = window.localStorage;
  window.storage = {
    async get(key) {
      const valor = temIndexedDB ? await operar("readonly", (l) => l.get(key)) : ls.getItem(key);
      if (valor === undefined || valor === null) throw new Error("chave não encontrada");
      return { key, value: valor, shared: false };
    },
    async set(key, value) {
      if (temIndexedDB) await operar("readwrite", (l) => l.put(value, key)); else ls.setItem(key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      if (temIndexedDB) await operar("readwrite", (l) => l.delete(key)); else ls.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const chaves = temIndexedDB ? await operar("readonly", (l) => l.getAllKeys()) : Object.keys(ls);
      return { keys: chaves.map(String).filter((k) => k.startsWith(prefix)), prefix, shared: false };
    },
  };
  // Pede ao navegador para não apagar os dados quando faltar espaço (importante para o campo offline)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
