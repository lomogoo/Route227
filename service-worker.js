// service-worker.js

// OneSignal SDKをインポートして、プッシュ通知機能を維持します
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

/**
 * 1. キャッシュ名のバージョン管理
 * ★★★ アプリのファイルを更新したら、このバージョンを上げてください (例: 'v1' -> 'v2') ★★★
 */
const CACHE_NAME = 'v4';

/**
 * 2. 事前にキャッシュするファイルのリスト
 * ここにリストアップされたファイルは、アプリの初回読み込み時にキャッシュされます。
 */
const urlsToCache = [
  './', // index.htmlをルートとしてキャッシュ
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  // ▼ 画像アセットもキャッシュ対象に含めます
  './assets/logo.png',
  './assets/truck.png',
  './assets/schedule.png',
  './assets/addhome.png',
  './assets/addhome2.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/rank-bronze.png',
  './assets/rank-silver.png',
  './assets/rank-gold.png',
  './assets/rank-platinum.png',
  './assets/rank-diamond.png'
];

/**
 * [installイベント] Service Workerがインストールされるときに実行されます。
 * ファイルをキャッシュに保存し、自身を即座に有効化(activate)する準備をします。
 */
self.addEventListener('install', (e) => {
  console.log(`[Service Worker] Install event for version ${CACHE_NAME}`);
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // 3. 新しいService Workerを待機させず、すぐに有効化します (重要)
        return self.skipWaiting();
      })
  );
});

/**
 * [activateイベント] Service Workerが有効化されたときに実行されます。
 * 古いバージョンのキャッシュを削除し、新しいService Workerがページを制御します。
 */
self.addEventListener('activate', (e) => {
  console.log(`[Service Worker] Activate event for version ${CACHE_NAME}`);
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          // 4. 現在のバージョンと異なる名前のキャッシュ(古いキャッシュ)を削除します (重要)
          if (key !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting old cache: ${key}`);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      // 5. 新しいService Workerが現在開かれているページを即座に制御できるようにします (重要)
      return self.clients.claim();
    })
  );
});

/**
 * [fetchイベント] ページからのリクエスト(画像読み込み等)をすべて捕捉します。
 * ここでは「Stale-While-Revalidate」という戦略を採用します。
 * 1. まずキャッシュから高速にレスポンスを返す。
 * 2. 同時に、裏側でネットワークに最新版をリクエストし、キャッシュを更新する。
 * 3. 次回以降のアクセスでは、更新されたキャッシュが使われる。
 */
self.addEventListener('fetch', (e) => {
  // SupabaseやOneSignalへのAPIリクエストはキャッシュ対象外とします
  if (e.request.url.includes('supabase.co') || e.request.url.includes('onesignal.com')) {
    return;
  }

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        // ネットワークからのレスポンスを非同期で取得
        const fetchPromise = fetch(e.request).then((networkResponse) => {
          // リクエストが成功したら、レスポンスのクローンをキャッシュに保存
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        });

        // キャッシュがあればそれを返し(高速表示)、裏でネットワークリクエストを実行。
        // キャッシュがなければ、ネットワークリクエストの結果を待つ。
        return cachedResponse || fetchPromise;
      });
    })
  );
});
