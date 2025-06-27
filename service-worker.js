// service-worker.js

// OneSignal SDKをインポートして、プッシュ通知機能を維持します
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

/**
 * 1. キャッシュ名のバージョン管理
 * ★★★ アプリのファイルを更新したら、このバージョンを上げてください (例: 'v1' -> 'v2') ★★★
 */
const CACHE_NAME = 'v5';

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
// service-worker.js の fetch イベントリスナーをこれに置き換えてください

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // ★★★ここからが重要な変更点★★★
  // SupabaseのURL（データベースAPIとStorageの両方）へのリクエストだった場合
  if (url.origin.includes('supabase.co')) {
    // キャッシュを一切見ずに、常にネットワークから最新の情報を取得します。
    // これにより、画像が動的に更新されるようになります。
    return fetch(e.request);
  }
  // ★★★ここまでが重要な変更点★★★

  // それ以外のアセット（HTML, CSS, JS, ローカル画像など）はキャッシュを利用する戦略（従来通り）
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        const fetchPromise = fetch(e.request).then((networkResponse) => {
          // ▼▼▼ ここからが修正箇所 ▼▼▼
          // GETリクエストで、かつ正常なレスポンスの場合のみキャッシュする
          if (e.request.method === 'GET' && networkResponse.ok) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        });

        // キャッシュがあればそれを先に返し（高速表示）、なければネットワークの結果を待つ
        return cachedResponse || fetchPromise;
      });
    })
  );
});
