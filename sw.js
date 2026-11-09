/* NailGestor — service worker
   Faz o app abrir mesmo sem internet depois da primeira visita.
   Estratégia "rede primeiro": com conexão, sempre pega a versão mais nova do GitHub
   (então basta subir um index.html novo para atualizar o app); sem conexão — ou se a
   rede demorar — usa a cópia guardada no aparelho. Os dados da agenda NÃO passam por aqui:
   eles ficam no localStorage/IndexedDB do próprio iPhone. */
const CACHE = 'nailgestor-v3';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];
const ESPERA_REDE_MS = 3500;

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(k => k.startsWith('nailgestor-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const daRede = fetch(req).then(resp => {
    if (resp && resp.ok && resp.type === 'basic') {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return resp;
  });
  ev.waitUntil(daRede.then(() => {}, () => {}));

  const doCache = () => caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : null));

  ev.respondWith(new Promise(resolve => {
    let pronto = false;
    const entrega = r => { if (!pronto && r) { pronto = true; resolve(r); } };
    const timer = setTimeout(() => doCache().then(entrega), ESPERA_REDE_MS);
    daRede
      .then(resp => { clearTimeout(timer); entrega(resp); })
      .catch(() => {
        clearTimeout(timer);
        doCache().then(r => { if (!pronto) { pronto = true; resolve(r || Response.error()); } });
      });
  }));
});
