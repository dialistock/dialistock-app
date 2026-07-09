// DialiStock SW - v13.0 (fix demo/QR, bugs de stock de seguridad y demo mode eliminado)
const CACHE_NAME = 'dialistock-v13';
const ASSETS = [
  '/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png',
  '/css/styles.css',
  '/js/data-init.js',
  '/js/auth-login.js',
  '/js/calculo-pedido.js',
  '/js/ui-dashboard.js',
  '/js/inventario.js',
  '/js/pacientes.js',
  '/js/proyeccion.js',
  '/js/lotes-recepcion.js',
  '/js/inventario-fisico.js',
  '/js/compras-proveedores.js',
  '/js/excel-dynamics-planillas.js',
  '/js/diario-charts-tabs.js',
  '/js/demo-gdrive-pwa.js',
  '/js/install-qr.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
