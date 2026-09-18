// Guarda o sistema no aparelho para abrir sem internet. Os dados ficam no IndexedDB, não aqui.
const CACHE = "integracao-conexao-v2";
const ESSENCIAIS = ["/", "/index.html", "/manifest.webmanifest", "/icone-192.png", "/fonts/nunito.ttf", "/favicon.svg?v=conexao-3", "/favicon-32.png?v=conexao-3", "__ARQUIVOS__"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (pedido.mode === "navigate") {
    // Página: tenta a versão mais nova; sem internet, usa a guardada
    evento.respondWith(
      fetch(pedido).then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE).then((c) => c.put("/index.html", copia));
        return resposta;
      }).catch(() => caches.match("/index.html"))
    );
    return;
  }
  // Arquivos do sistema: usa o guardado e atualiza em segundo plano
  evento.respondWith(
    caches.match(pedido).then((guardado) => {
      const daRede = fetch(pedido).then((resposta) => {
        if (resposta.ok) { const copia = resposta.clone(); caches.open(CACHE).then((c) => c.put(pedido, copia)); }
        return resposta;
      }).catch(() => guardado);
      return guardado || daRede;
    })
  );
});
