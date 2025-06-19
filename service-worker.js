// service-worker.js
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installed');
  e.waitUntil(
    caches.open('v1').then((cache) => {
      // パスを現在のディレクトリ基準に修正
      return cache.addAll([
        './',
        './index.html',
        './style.css',
        './app.js',
        './manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
