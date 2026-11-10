// Service Worker: macht Apoko offline verfügbar.
const CACHE = 'apoko-v56';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/gs1.js', 'js/knowledge.js', 'js/store.js', 'js/share.js', 'js/scanner.js', 'js/drugdb.js', 'js/photos.js', 'js/ocr.js', 'js/productdb.js', 'js/advice.js', 'js/research.js', 'js/klick.js',
  'vendor/qrcode.js', 'vendor/zxing.min.js',
  'fonts/SpaceGrotesk-latin.woff2',
  'img/people/mann.webp', 'img/people/frau.webp', 'img/people/kind1.webp', 'img/people/kind2.webp',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Netzwerk zuerst (für Updates), bei fehlender Verbindung aus dem Cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // Browser-Cache umgehen, damit Updates vollständig ankommen
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
