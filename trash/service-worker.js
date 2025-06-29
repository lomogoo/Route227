importScripts('OneSignalSDK.sw.js');

/**
 * 1. キャッシュ戦略の定義
 * 異なるタイプのリソースに対して異なるキャッシュ戦略を適用
 */
const CACHE_VERSION = 'v6';
const CACHE_NAMES = {
  STATIC: `static-${CACHE_VERSION}`,      // HTML, CSS, JS
  IMAGES: `images-${CACHE_VERSION}`,      // 画像ファイル
  DYNAMIC: `dynamic-${CACHE_VERSION}`,    // API レスポンス
  OFFLINE: `offline-${CACHE_VERSION}`     // オフラインページ
};

// すべてのキャッシュ名のリスト
const ALL_CACHES = Object.values(CACHE_NAMES);

/**
 * 2. 事前にキャッシュするファイルのリスト
 * 重要なファイルは初回読み込み時にキャッシュ
 */
const STATIC_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/logo.png',
  './assets/truck.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// オフラインページ（作成が必要）
const OFFLINE_PAGE = './offline.html';

/**
 * 3. インストールイベント
 * Service Workerがインストールされるときに実行
 */
self.addEventListener('install', event => {
  console.log(`[Service Worker] Install event for version ${CACHE_VERSION}`);
  
  event.waitUntil(
    Promise.all([
      // 静的ファイルをキャッシュ
      caches.open(CACHE_NAMES.STATIC).then(cache => {
        console.log('[Service Worker] Caching static files');
        return cache.addAll(STATIC_FILES);
      }),
      // オフラインページを作成してキャッシュ
      caches.open(CACHE_NAMES.OFFLINE).then(cache => {
        return fetch(new Request('./index.html')).then(response => {
          return response.text();
        }).then(html => {
          // 簡易的なオフラインページを生成
          const offlineHtml = html.replace(
            /<title>.*<\/title>/,
            '<title>オフライン - Route227</title>'
          ).replace(
            /<body[^>]*>/,
            '<body><div style="position: fixed; top: 0; left: 0; right: 0; background: #f44336; color: white; padding: 10px; text-align: center; z-index: 9999;">オフラインです</div>'
          );
          
          return cache.put(
            OFFLINE_PAGE,
            new Response(offlineHtml, {
              headers: { 'Content-Type': 'text/html' }
            })
          );
        });
      })
    ]).then(() => {
      // 新しいService Workerを待機させず、すぐに有効化
      return self.skipWaiting();
    })
  );
});

/**
 * 4. アクティベートイベント
 * 古いキャッシュの削除と新しいService Workerの有効化
 */
self.addEventListener('activate', event => {
  console.log(`[Service Worker] Activate event for version ${CACHE_VERSION}`);
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 現在のバージョンのキャッシュ以外は削除
          if (!ALL_CACHES.includes(cacheName)) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 新しいService Workerが現在開かれているページを即座に制御
      return self.clients.claim();
    })
  );
});

/**
 * 5. フェッチイベント - リクエストのインターセプト
 * 異なるリソースタイプに対して異なる戦略を適用
 */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

    // 【↓ここから追加↓】
  // OneSignalへのAPIリクエストはService Workerのキャッシュ処理から除外する
  if (url.hostname.includes('onesignal.com')) {
    // OneSignalSDK.sw.jsが内部で適切に処理するため、ここでは何もしない
    return;
  }
  // 【↑ここまで追加↑】
  
  // Supabase APIとストレージは常にネットワークから取得
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(() => {
        // オフライン時はキャッシュから返す（もしあれば）
        return caches.match(request);
      })
    );
    return;
  }
  
  // ナビゲーションリクエスト（HTML）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 成功したらキャッシュを更新
          const responseToCache = response.clone();
          caches.open(CACHE_NAMES.STATIC).then(cache => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // オフライン時はキャッシュから返す
          return caches.match(request).then(response => {
            return response || caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }
  
  // 画像リクエスト
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAMES.IMAGES).then(cache => {
        return cache.match(request).then(cachedResponse => {
          // キャッシュがあればそれを返す
          if (cachedResponse) {
            // バックグラウンドで更新をチェック
            fetch(request).then(networkResponse => {
              if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
            }).catch(() => {
              // ネットワークエラーは無視
            });
            return cachedResponse;
          }
          
          // キャッシュがなければネットワークから取得
          return fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // プレースホルダー画像を返す
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="100%" height="100%" fill="#f0f0f0"/><text x="50%" y="50%" font-family="Arial" font-size="18" fill="#999" text-anchor="middle" dy=".3em">画像を読み込めません</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          });
        });
      })
    );
    return;
  }
  
  // その他の静的リソース（CSS, JS）
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          // キャッシュがあればそれを返し、バックグラウンドで更新
          fetch(request).then(networkResponse => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAMES.STATIC).then(cache => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {
            // ネットワークエラーは無視
          });
          return cachedResponse;
        }
        
        // キャッシュがなければネットワークから取得
        return fetch(request).then(networkResponse => {
          if (networkResponse.ok && request.method === 'GET') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAMES.STATIC).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }
  
  // 外部リソース（CDNなど）
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

/**
 * 6. バックグラウンド同期（将来の実装用）
 */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-stamps') {
    event.waitUntil(
      // ここで保留中のスタンプ操作を同期
      self.registration.showNotification('Route227', {
        body: '保留中の操作を同期しました',
        icon: './assets/icon-192.png',
        badge: './assets/icon-192.png'
      })
    );
  }
});

/**
 * 7. プッシュ通知のカスタマイズ
 */
// プッシュ通知のカスタマイズを削除（OneSignalに任せる）
/*
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || '新しいお知らせがあります',
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      vibrate: [200, 100, 200],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2'
      },
      actions: [
        {
          action: 'explore',
          title: '詳細を見る',
        },
        {
          action: 'close',
          title: '閉じる',
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Route227', options)
    );
  }
});
*/

/**
 * 8. 通知クリックの処理
 */

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'explore') {
    // 詳細ページを開く
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

/**
 * 9. キャッシュサイズの管理（定期的なクリーンアップ）
 */
async function cleanupCaches() {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7日間
  const now = Date.now();
  
  for (const cacheName of ALL_CACHES) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const dateHeader = response.headers.get('date');
        if (dateHeader) {
          const cachedDate = new Date(dateHeader).getTime();
          if (now - cachedDate > maxAge) {
            await cache.delete(request);
          }
        }
      }
    }
  }
}

// 定期的にキャッシュをクリーンアップ
self.addEventListener('message', event => {
  if (event.data === 'cleanup-caches') {
    event.waitUntil(cleanupCaches());
  }
});

console.log('[Service Worker] Loaded successfully');
