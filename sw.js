// Offline cache for the app shell (the car data always comes live from the adapter).
const C = 'car-scanner-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'js/app.js', 'js/obd.js', 'js/elm.js', 'js/ble.js', 'js/sim.js', 'js/scan.js',
  'data/dtc_ar.json', 'data/vag_modules.json', 'cars/anchors.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
