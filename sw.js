'use strict';
// Guarda la app en el dispositivo para que funcione sin conexión.
// Al publicar cambios, sube el número de VERSION para que se actualice.
const VERSION = 'arritmias-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/estilos.css',
  'js/ritmos.js',
  'js/motor.js',
  'js/monitor.js',
  'js/escenarios.js',
  'js/app.js',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/icono-512-mascara.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Red primero (para recibir actualizaciones) y, sin conexión, la copia guardada.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && new URL(e.request.url).origin === location.origin) {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
