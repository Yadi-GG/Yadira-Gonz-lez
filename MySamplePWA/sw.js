// sw.js (mejorado)
const PRECACHE = 'temperature-precache-v1';
const RUNTIME = 'temperature-runtime-v1';

const PRECACHE_URLS = [
  '/',                // importante para navegación SPA
  '/index.html',
  '/converter.js',    // tu script
  '/converter.css',   // tu css
  '/manifest.json',   // si lo agregas
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: precache assets
self.addEventListener('install', event => {
  self.skipWaiting(); // activa este SW inmediatamente (útil en dev)
  event.waitUntil(
    caches.open(PRECACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

// Activate: limpiar caches viejos
self.addEventListener('activate', event => {
  const currentCaches = [PRECACHE, RUNTIME];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (!currentCaches.includes(key)) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Estrategia cache-first para assets
async function cacheFirst(request) {
  const cache = await caches.open(PRECACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // opcional: cache.put(request, response.clone()); // evita cachear mucho runtime aquí
    return response;
  } catch (err) {
    // si ni cache ni network, fallback simple (puedes personalizar)
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// Estrategia network-first (buena para APIs dinámicas)
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Para endpoints API, devolvemos JSON indicando offline
    if (request.headers.get('accept') && request.headers.get('accept').includes('application/json')) {
      return new Response(JSON.stringify({ error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // Ignorar métodos distintos a GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Si es navegación (usuario escribe URL / SPA) -> sirve index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(PRECACHE).then(cache =>
        cache.match('/index.html').then(cached => cached || fetch('/index.html'))
      )
    );
    return;
  }

  // --- Detectar llamadas a API/lecturas (ajusta según cómo tu app consume datos) ---
  // Si en el futuro tu app pide datos desde /api/temperatura o /lecturas → network-first
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/lecturas') || url.pathname.includes('/temperatura')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Recursos del mismo origen -> cache-first (assets)
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Por defecto, dejar pasar a la red
});

