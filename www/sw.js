const CACHE_NAME = 'cinecash-v2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './bg.png',
  './confetti.js',
  './firebase-app.js',
  './firebase-auth.js',
  './firebase-database.js'
];

// Instalação: Cacheia todos os recursos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('CineCash Cache: Offline assets pre-cached');
        return cache.addAll(urlsToCache);
      })
  );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('CineCash SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estratégia de Fetch: Cache-First para assets locais, Network-Only para APIs
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar requisições de API e Firebase (deixar o navegador/SDK lidar com a rede)
  if (url.origin.includes('firebaseio.com') || url.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se estiver no cache, retorna. Caso contrário, busca na rede.
        return response || fetch(event.request).then(fetchRes => {
          // Opcional: Cachear dinamicamente novos assets locais encontrados
          if (url.origin === self.location.origin) {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, fetchRes.clone());
              return fetchRes;
            });
          }
          return fetchRes;
        });
      }).catch(() => {
        // Fallback básico para quando estiver totalmente offline e o recurso não estiver no cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});
