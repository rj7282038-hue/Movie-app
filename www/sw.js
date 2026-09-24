// Service Worker for Ghazi OTT - Instant App Caching & Offline Shell
const CACHE_NAME = 'ghazi-ott-v1';
const ASSETS_TO_CACHE = [
  'index.html',
  'player.html',
  'css/style.css',
  'css/player.css',
  'js/app.js',
  'js/player.js',
  'manifest.json',
  'assets/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Do not cache TMDB API requests or streaming video iframes in service worker cache
  if (
    event.request.url.includes('api.themoviedb.org') ||
    event.request.url.includes('videasy.net') ||
    event.request.url.includes('vidsrc') ||
    event.request.url.includes('smashystream') ||
    event.request.url.includes('multiembed')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('index.html');
          }
        })
      );
    })
  );
});
