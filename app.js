/* 1) Supabase 初期化 */

const { createClient } = window.supabase;
const db = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

/* 2) グローバル変数 */
let globalUID = null;
let html5QrCode = null;
let articlesCache = [];
const ARTICLES_PER_PAGE = 10;
let currentPage = 0;
let currentCategory = 'all';
let isLoadingMore = false;
let isInitialAuthCheckDone = false;

const appData = {
  qrString: "ROUTE227_STAMP_2025"
};

/* 3) メイン処理 */
document.addEventListener('DOMContentLoaded', () => {
  setupStaticEventListeners();

  db.auth.onAuthStateChange(async (event, session) => {
    const previousUID = globalUID;
    globalUID = session?.user?.id || null;
    updateUserStatus(session);

    if (!isInitialAuthCheckDone) {
      isInitialAuthCheckDone = true;
      const appLoader = document.getElementById('app-loader');
      if (!appLoader.classList.contains('active')) {
        appLoader.classList.add('active');
      }
      
      try {
        const lastSection = sessionStorage.getItem('activeSection') || 'feed-section';
        await showSection(lastSection, true);
        handleUrlHash();
      } catch (error) {
        console.error("[INIT] Critical error during initial load:", error);
        await showSection('feed-section', true);
      } finally {
        appLoader.classList.remove('active');
      }
    }
    else {
      if (event === 'SIGNED_IN' && !previousUID && globalUID) {
        const currentActiveSectionId = document.querySelector('.section.active')?.id || 'foodtruck-section';
        await showSection(currentActiveSectionId, false);
      }

      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('activeSection');
        window.location.reload();
      }
    }
  });
});

/* 4) ナビゲーションと表示切替 */
function setupStaticEventListeners() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const sectionId = e.currentTarget.dataset.section;
      sessionStorage.setItem('activeSection', sectionId);
      showSection(sectionId);
    });
  });

  document.getElementById('load-more-btn')?.addEventListener('click', () => {
    if (isLoadingMore) return;
    currentPage++;
    renderArticles(currentCategory, false);
  });

  const emailForm = document.getElementById('email-form');
  const otpForm = document.getElementById('otp-form');
  const emailInput = document.getElementById('email');
  const otpCodeInput = document.getElementById('otp-code');
  const emailMessage = document.getElementById('email-message');
  const otpMessage = document.getElementById('otp-message');
  const otpEmailDisplay = document.getElementById('otp-email-display');
  const changeEmailBtn = document.getElementById('change-email-btn');

  emailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const submitButton = emailForm.querySelector('button[type="submit"]');
    submitButton.disabled = true; submitButton.textContent = '送信中...'; emailMessage.textContent = '';
    try {
      const { error } = await db.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true }});
      if (error) throw error;
      emailMessage.textContent = '✅ メールを確認してください！';
      otpEmailDisplay.textContent = email;
      emailForm.classList.add('hidden');
      otpForm.classList.remove('hidden');
    } catch (err) {
      emailMessage.textContent = `❌ ${err.message || 'エラーが発生しました。'}`;
    } finally {
      submitButton.disabled = false; submitButton.textContent = '認証コードを送信';
    }
  });

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = otpEmailDisplay.textContent;
    const token = otpCodeInput.value.trim();
    const submitButton = otpForm.querySelector('button[type="submit"]');
    submitButton.disabled = true; submitButton.textContent = '認証中...'; otpMessage.textContent = '';
    try {
      const { data, error } = await db.auth.verifyOtp({ email: email, token: token, type: 'email' });
      if (error) throw error;
      closeModal(document.getElementById('login-modal'));
    } catch (err) {
      otpMessage.textContent = `❌ ${err.message || '認証に失敗しました。'}`;
    } finally {
      submitButton.disabled = false; submitButton.textContent = '認証する';
    }
  });
  
  changeEmailBtn?.addEventListener('click', () => {
    otpForm.classList.add('hidden');
    emailForm.classList.remove('hidden');
    emailMessage.textContent = '';
    otpMessage.textContent = '';
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.matches('.close-modal') || e.target.matches('.close-notification')) {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    }
    if (e.target.matches('.modal')) {
      closeModal(e.target);
    }
  });

  initializeNotificationButton();
}

// app.js の中の showSection 関数を検索し、以下のように修正

async function showSection(sectionId, isInitialLoad = false) {
  const appLoader = document.getElementById('app-loader');
  if (!isInitialLoad) appLoader.classList.add('active');

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.section === sectionId);
  });

  const sectionElement = document.getElementById(sectionId);
  if (sectionElement) {
    sectionElement.classList.add('active');
    if (sectionId === 'feed-section') await initializeFeedPage();
    else if (sectionId === 'foodtruck-section') initializeFoodtruckPage();
    else if (sectionId === 'rank-section') initializeRankPage(); // ★この行を追加
  }
  
  if (!isInitialLoad) {
      setTimeout(() => appLoader.classList.remove('active'), 100);
  }
}

function updateUserStatus(session) {
    const userStatusDiv = document.getElementById('user-status');
    if (userStatusDiv) {
        userStatusDiv.innerHTML = session ? '<button id="logout-button" class="btn">ログアウト</button>' : '';
        if (session) document.getElementById('logout-button').addEventListener('click', () => db.auth.signOut());
    }
}

/* 5) ページ別初期化ロジック */
async function initializeFeedPage() {
  const categoryTabs = document.getElementById('category-tabs');
  if (categoryTabs && !categoryTabs.dataset.listenerAttached) {
    categoryTabs.dataset.listenerAttached = 'true';
    categoryTabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-tab')) {
        currentPage = 0;
        currentCategory = e.target.dataset.category;
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        renderArticles(currentCategory, true);
      }
    });
  }
  
  currentPage = 0;
  currentCategory = 'all';
  document.querySelectorAll('.category-tab').forEach(t => t.classList.toggle('active', t.dataset.category === 'all'));
  
  renderArticles(currentCategory, true);
}

function initializeFoodtruckPage() {
  updateFoodtruckInfo(); 
  if (!globalUID) {
    document.getElementById('login-modal').classList.add('active');
    updateStampDisplay(0);
    updateRewardButtons(0);
    return;
  }
  
  updateStampDisplay(0);
  updateRewardButtons(0);
  setupFoodtruckActionListeners();

  (async () => {
    try {
      const stampCount = await fetchUserRow(globalUID);
      updateStampDisplay(stampCount);
      updateRewardButtons(stampCount);
    } catch (error) {
      console.error("Failed to fetch stamp count in background:", error);
    }
  })();
}

/* 6) ヘルパー関数群 */
function setupFoodtruckActionListeners() {
    const foodtruckSection = document.getElementById('foodtruck-section');
    if (!foodtruckSection || foodtruckSection.dataset.listenersAttached === 'true') {
        return;
    }
    foodtruckSection.dataset.listenersAttached = 'true';

    document.getElementById('scan-qr')?.addEventListener('click', initQRScanner);
    document.getElementById('coffee-reward')?.addEventListener('click', () => redeemReward('coffee'));
    document.getElementById('curry-reward')?.addEventListener('click', () => redeemReward('curry'));
}

function closeModal(modalElement) {
    if(!modalElement) return;
    modalElement.classList.remove('active');
    if (modalElement.id === 'qr-modal' && html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
    }
}

async function fetchUserRow(uid) {
  try {
    const { data, error } = await db
      .from('users')
      .select('stamp_count')
      .eq('supabase_uid', uid)
      .maybeSingle(); 

    if (error) throw error;
    return data?.stamp_count || 0;
  } catch (err) {
    showNotification('データベースエラー', 'ユーザー情報の取得に失敗しました。');
    throw err;
  }
}

async function updateStampCount(uid, newCount) {
  try {
    const { data, error } = await db.from('users').update({ stamp_count: newCount, updated_at: new Date().toISOString() }).eq('supabase_uid', uid).select().single();
    if (error) throw error;
    return data.stamp_count;
  } catch(err) {
    showNotification('エラー', 'スタンプの保存に失敗しました。');
    throw err;
  }
}

function updateStampDisplay(count) {
  document.querySelectorAll('.stamp').forEach((el, i) => el.classList.toggle('active', i < count));
}

function updateRewardButtons(count) {
  const coffeeBtn = document.getElementById('coffee-reward');
  const curryBtn = document.getElementById('curry-reward');
  const coffeeItem = document.getElementById('coffee-reward-item');
  const curryItem = document.getElementById('curry-reward-item');

  if (coffeeBtn) coffeeBtn.disabled = count < 3;
  if (curryBtn) curryBtn.disabled = count < 6;
  coffeeItem?.classList.toggle('available', count >= 3);
  curryItem?.classList.toggle('available', count >= 6);
}

function showNotification(title, msg) {
  const modal = document.getElementById('notification-modal');
  if(modal){
    document.getElementById('notification-title').textContent = title;
    document.getElementById('notification-message').innerHTML = msg; // textContentからinnerHTMLへ変更
    modal.classList.add('active');
  }
}

async function addStamp() {
  if (!globalUID) return;
  try {
    let count = await fetchUserRow(globalUID);
    if (count >= 6) return showNotification('コンプリート！', 'スタンプが6個たまりました！');
    count = await updateStampCount(globalUID, count + 1);
    updateStampDisplay(count);
    updateRewardButtons(count);
    if (count === 3 || count === 6) showNotification('🎉', count === 3 ? 'コーヒー1杯と交換できます！<br>あと３スタンプでカレー１杯無料！' : '次回、カレー1杯無料！');
    else showNotification('スタンプ獲得', `現在 ${count} 個`);
  } catch (error) {
    showNotification('エラー', 'スタンプの追加に失敗しました。');
  }
}

async function redeemReward(type) {
  if (!globalUID) return;
  try {
    let count = await fetchUserRow(globalUID);
    const required = type === 'coffee' ? 3 : 6;
    if (count < required) return;
    count = await updateStampCount(globalUID, count - required);
    updateStampDisplay(count);
    updateRewardButtons(count);
    showNotification('交換完了', `${type === 'coffee' ? 'コーヒー' : 'カレー'}と交換しました！`);
  } catch (error) {
    showNotification('エラー', '特典の交換に失敗しました。');
  }
}

function initQRScanner() {
  const qrModal = document.getElementById('qr-modal');
  qrModal?.classList.add('active');
  let isProcessing = false;
  html5QrCode = new Html5Qrcode('qr-reader');
  html5QrCode.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } },
    async (decodedText) => {
      if (isProcessing) return;
      isProcessing = true;
      if (html5QrCode.isScanning) await html5QrCode.stop();
      closeModal(qrModal);
      if (decodedText === appData.qrString) {
        await addStamp();
      } else {
        showNotification('無効なQR', 'お店のQRコードではありません。');
      }
    },
    (errorMessage) => {}
  ).catch(() => document.getElementById('qr-reader').innerHTML = '<p style="color: red;">カメラの起動に失敗しました</p>');
}

function renderArticles(category, clearContainer) {
  const articlesContainer = document.getElementById('articles-container');
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (!articlesContainer || !loadMoreBtn) return;

  isLoadingMore = true;
  if (clearContainer) {
    articlesContainer.innerHTML = '<div class="loading-spinner"></div>';
    articlesCache = [];
  } else {
    loadMoreBtn.textContent = '読み込み中...';
    loadMoreBtn.disabled = true;
  }

  (async () => {
    try {
      const from = currentPage * ARTICLES_PER_PAGE;
      const to = from + ARTICLES_PER_PAGE - 1;

      let query = db.from('articles').select('*').order('created_at', { ascending: false }).range(from, to);
      if (category !== 'all') {
        query = query.eq('category', category);
      }
      
      const { data: newArticles, error } = await query;
      if (error) throw error;

      if (clearContainer) {
          articlesContainer.innerHTML = '';
      }
      
      articlesCache.push(...newArticles);

      if (articlesCache.length === 0 && clearContainer) {
        articlesContainer.innerHTML = '<p style="text-align: center; padding: 20px;">記事はまだありません。</p>';
      } else {
        newArticles.forEach(cardData => {
          const div = document.createElement('div');
          div.className = 'card';
          const placeholderUrl = 'https://via.placeholder.com/400x250.png?text=Route227';
          const imageUrl = cardData.image_url || placeholderUrl;
          
          div.innerHTML = `
            <div class="article-link" data-article-id="${cardData.id}" role="button" tabindex="0">
              <img src="${imageUrl}" alt="${cardData.title}のサムネイル" loading="lazy" onerror="this.onerror=null;this.src='${placeholderUrl}';">
              <div class="card-body">
                <h3 class="article-title">${cardData.title}</h3>
                <p class="article-excerpt">${cardData.summary}</p>
              </div>
            </div>`;
          articlesContainer.appendChild(div);
        });
      }

      if (newArticles.length < ARTICLES_PER_PAGE) {
        loadMoreBtn.classList.remove('visible');
      } else {
        loadMoreBtn.classList.add('visible');
      }

      document.querySelectorAll('.article-link').forEach(link => {
        if(link.dataset.listenerAttached) return;
        link.dataset.listenerAttached = 'true';
        link.addEventListener('click', (e) => {
          const articleId = e.currentTarget.dataset.articleId;
          showSummaryModal(parseInt(articleId, 10));
        });
      });

    } catch (error) {
      console.error("記事の読み込みエラー:", error);
      articlesContainer.innerHTML = '<div class="status status--error">記事の読み込みに失敗しました。</div>';
    } finally {
      isLoadingMore = false;
      loadMoreBtn.textContent = 'さらに読み込む';
      loadMoreBtn.disabled = false;
    }
  })();
}

function showSummaryModal(articleId) {
    const article = articlesCache.find(a => a.id === articleId);
    if (!article) return;
    const modal = document.getElementById('summary-modal');
    const imgEl = document.getElementById('summary-image');
    const titleEl = document.getElementById('summary-title');
    const bulletsEl = document.getElementById('summary-bullets');
    const readMoreBtn = document.getElementById('summary-read-more');
    
    const placeholderUrl = 'https://via.placeholder.com/400x250.png?text=Route227';
    const imageUrl = article.image_url || placeholderUrl;
    imgEl.style.backgroundImage = `url('${imageUrl}')`;

    titleEl.textContent = article.title;
    bulletsEl.innerHTML = article.summary_points?.map(point => `<li>${point.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('') || '';
    const articleUrl = article.article_url?.trim();
  if (!articleUrl) {
    readMoreBtn.style.display = 'none';  // URLが空のときは非表示
  } else {
    readMoreBtn.href = articleUrl;
    readMoreBtn.style.display = 'flex';  // 表示（もしくは 'inline-flex'）
  }
  modal.classList.add('active');
}
function promiseWithTimeout(promise, ms, timeoutError = new Error('Promise timed out')) {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(timeoutError);
    }, ms);
  });
  return Promise.race([promise, timeout]);
}

/**
 * URLのハッシュをチェックして、対応する記事のサマリーモーダルを開く関数
 */
function handleUrlHash() {
  const hash = window.location.hash;

  if (hash && hash.startsWith('#article-')) {
    const articleId = parseInt(hash.substring(9), 10);
    if (isNaN(articleId)) return;

    let attempts = 0;
    const maxAttempts = 20;

    const tryShowModal = () => {
      const article = articlesCache.find(a => a.id === articleId);
      
      if (article) {
        showSummaryModal(articleId);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(tryShowModal, 500);
      }
    };

    tryShowModal();
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
}

/**
 * ▼▼▼ [変更ここから] 通知設定ボタンの初期化関数を全面的に刷新 ▼▼▼
 * 通知設定ボタンを初期化し、状態に応じてアイコンを更新する関数
 */
function initializeNotificationButton() {
  const container = document.getElementById('notification-button-container');
  if (!container) return;

  // 各状態に対応するSVGアイコン
  const icons = {
    granted: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    denied: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    default: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  };

  const updateButton = (permission) => {
    let iconHtml = '';
    let clickHandler = () => {};

    // 以前のクラスを削除し、現在の状態クラスを追加
    container.classList.remove('granted', 'denied', 'default');
    container.classList.add(permission);

    switch (permission) {
      case 'granted':
        iconHtml = icons.granted;
        clickHandler = () => showNotification('設定確認', 'プッシュ通知は既にオンになっています。');
        break;
      case 'denied':
        iconHtml = icons.denied;
        clickHandler = () => showNotification('設定の変更方法', '通知がブロックされています。ブラウザの設定から変更してください。');
        break;
      default: // 'default'
        iconHtml = icons.default;
        clickHandler = () => {
          // v6：明示的に Permission をリクエスト
          OneSignal.Notifications.requestPermission();
        };
        break;
    }
    container.innerHTML = `<button type="button" aria-label="通知設定">${iconHtml}</button>`;
    container.querySelector('button')?.addEventListener('click', clickHandler);
  };

  // OneSignal SDK の準備ができたら実行
  window.OneSignalDeferred.push(function(OneSignal) {
    // 許可状態が変更されたら、リアルタイムでボタンの表示を更新
    OneSignal.Notifications.addEventListener('permissionChange', (permission) => {
      updateButton(permission);
    });
    
    // 初期表示のために、現在の許可状態を取得してボタンを生成
    updateButton(OneSignal.Notifications.permission);
  });
}
/**
 * ▲▲▲ [変更ここまで] ▲▲▲
 */
// PWA判定して body にクラス追加
window.addEventListener('DOMContentLoaded', () => {
  const isPWA =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isPWA) {
    document.body.classList.add('pwa');
  }
});


// 既存のPWAバナーの 'DOMContentLoaded' イベントリスナーをこちらに差し替えてください

window.addEventListener('DOMContentLoaded', () => {
  // アプリがホーム画面から起動されている（スタンドアロンモード）か判定
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  // PWAとしてインストールされていない場合のみバナーを表示
  if (!isStandalone) {
    const banner = document.getElementById('pwa-banner');
    const closeBtn = document.getElementById('pwa-banner-close');
    const bannerImage = document.getElementById('pwa-banner-image'); // IDで画像要素を取得

    // ユーザーのOSがAndroidか判定
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      // Androidの場合は 'addhome2.png' を表示
      bannerImage.src = 'assets/addhome2.png';
    }
    // それ以外（iOSなど）の場合は、HTMLに記述されたデフォルトの 'assets/addhome.png' が使われます

    // バナーを表示する
    banner.classList.remove('hidden');

    // 閉じるボタンの処理
    closeBtn.addEventListener('click', () => {
      // バナーを非表示にするだけ（localStorageへの保存は行わない）
      banner.classList.add('hidden');
    });
  }
});

// app.js の一番最後に追加

window.addEventListener('pageshow', function(event) {
  // ブラウザの「戻る」ボタンなどでページがキャッシュから復元された場合にリロードする
  if (event.persisted) {
    window.location.reload();
  }
});



// `app.js` の一番最後に追加

/**
 * Supabaseから今日の出店情報を取得し、表示を更新する関数
 */
/**
 * Supabaseから今日の出店情報とスケジュール画像を取得し、表示を更新する関数
 */
/**
 * [改修版] Supabaseから今日の出店情報と画像を確実に取得し、表示を更新する関数
 */
/**
 * [最終改修版] Supabaseから今日の出店情報と画像を確実に取得し、表示を更新する関数
 */
async function updateFoodtruckInfo() {
  // 1. HTMLの要素をIDで取得します
  const infoContainer = document.getElementById('today-info-container');
  const imageContainer = document.getElementById('schedule-image-container');

  if (!infoContainer || !imageContainer) {
    console.error('Error: #today-info-container または #schedule-image-container が見つかりません。');
    return;
  }

  // 2. UIを「読み込み中」の状態にします
  infoContainer.innerHTML = '<p>情報を読み込んでいます...</p>';
  imageContainer.style.display = 'none'; // 画像を一旦非表示に
  imageContainer.src = ''; // srcをクリア

  try {
    // 3. 今日の日付を 'YYYY-MM-DD' 形式で取得します
    const today = new Date();
    today.setHours(today.getHours() + 9);
    const todayString = today.toISOString().split('T')[0];
    console.log(`[OK] 本日の日付 (${todayString}) で情報を検索します。`);

    // 4. Supabaseの 'schedule' テーブルに問い合わせます
    const { data, error } = await db
      .from('schedule')
      .select('message, image_name')
      .eq('date', todayString)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // 5. データが見つかった場合の処理
    if (data) {
      console.log('[OK] データが見つかりました:', data);
      infoContainer.innerHTML = `<p>${data.message ? data.message.replace(/\n/g, '<br>') : 'メッセージがありません'}</p>`;

      if (data.image_name) {
        console.log(`[OK] 画像ファイル名 (${data.image_name}) を元にURLを取得します。`);
        const { data: imageData } = db.storage.from('schedule_images').getPublicUrl(data.image_name);
        
        if (imageData && imageData.publicUrl) {
          console.log('[OK] 画像のURLを取得しました:', imageData.publicUrl);
          
          // ▼▼▼ ここからが新しい、より確実な表示処理です ▼▼▼
          imageContainer.src = imageData.publicUrl;

          // 画像の読み込みが正常に完了したことを確認してから表示します
          imageContainer.onload = () => {
            console.log('[SUCCESS] 画像のロードが完了し、表示します。');
            imageContainer.style.display = 'block';
          };
          // 万が一、URLはあっても画像の読み込みに失敗した場合のエラー処理
          imageContainer.onerror = () => {
            console.error('[FAIL] 画像のロードに失敗しました。URLが正しいか、画像ファイルが破損していないか確認してください。');
          };
          // ▲▲▲ ここまで ▲▲▲

        } else {
          console.warn('[WARN] 画像のURL取得に失敗しました。');
        }
      } else {
        console.log('[INFO] この日のデータに画像は登録されていません。');
      }

    } else {
      console.log('[INFO] 本日の出店情報データは見つかりませんでした。');
      infoContainer.innerHTML = '<p>本日の出店はありません。</p>';
    }

  } catch (err) {
    console.error('[FATAL] 出店情報の取得処理中に致命的なエラーが発生しました。', err);
    infoContainer.innerHTML = '<p>エラーが発生しました。情報の取得に失敗しました。</p>';
  }
}






// app.js の一番最後に追加

/**
 * ============================================
 * Rank System Logic
 * ============================================
 */
// let rankSystemInstance = null; // ランクシステムのインスタンスを管理

// app.js 内の class RankSystem { ... } の全体をこちらに差し替え

// class RankSystem {
    //constructor() {
      //  this.currentXP = 0;
        //this.currentRank = 1;
       // this.totalXP = 0;
       // this.confettiCount = 100;

        // DOM Elements
       // this.medalContainer = document.getElementById('rank-medal'); // IDのターゲットを親に変更
       // this.rankName = document.getElementById('rank-name');
        //this.xpToNextRank = document.getElementById('xp-to-next-rank');
        //this.progressBar = document.getElementById('progress-bar');
       // this.progressText = document.getElementById('progress-text');
       // this.rankList = document.getElementById('rank-list');
  /*      this.sparklesContainer = document.querySelector('.sparkles');
        this.glowEffect = document.querySelector('.glow-effect');

        this.addProgressBtn = document.getElementById('addProgressBtn');
        this.rankUpBtn = document.getElementById('rankUpBtn');

        // ▼▼▼ [変更点] ランクをダイヤモンドまでにし、画像パスを追加 ▼▼▼
        this.ranks = [
            { id: 1, name: "ブロンズ", color: "#B8860B", maxXP: 100, rotations: 3, imagePath: "assets/rank-bronze.png" },
            { id: 2, name: "シルバー", color: "#C0C0C0", maxXP: 250, rotations: 3.5, imagePath: "assets/rank-silver.png" },
            { id: 3, name: "ゴールド", color: "#FFD700", maxXP: 500, rotations: 4, imagePath: "assets/rank-gold.png" },
            { id: 4, name: "プラチナ", color: "#E5E4E2", maxXP: 1000, rotations: 4.5, imagePath: "assets/rank-platinum.png" },
            { id: 5, name: "ダイヤモンド", color: "#B9F2FF", maxXP: 2000, rotations: 5, imagePath: "assets/rank-diamond.png" },
        ];
        // ▲▲▲ [ここまで変更] ▲▲▲

        this.init();
    }

    init() {
        // 画像を事前に読み込む
        this.ranks.forEach(rank => {
            const img = new Image();
            img.src = rank.imagePath;
        });
        
        this.addProgressBtn.addEventListener('click', () => this.addProgress(10));
        this.rankUpBtn.addEventListener('click', () => this.rankUp());
        this.populateRankList();
        this.updateDisplay();
    }
    
    addProgress(xp) {
        if (this.currentRank >= this.ranks.length && this.ranks[this.currentRank-1].maxXP <= this.currentXP) return;

        const currentRankData = this.ranks[this.currentRank - 1];
        this.currentXP += xp;
        this.totalXP += xp;
        if (this.currentXP >= currentRankData.maxXP) {
            this.currentXP = currentRankData.maxXP;
        }
        this.updateDisplay();
    }

    rankUp() {
        const currentRankData = this.ranks[this.currentRank - 1];
        if (!currentRankData || this.currentXP < currentRankData.maxXP) return;
        if (this.currentRank >= this.ranks.length) return; // 最終ランクならランクアップしない

        this.currentRank++;
        const xpOver = this.currentXP - currentRankData.maxXP;
        this.currentXP = xpOver;
        
        this.playEnhancedRotationAnimation();
        this.playCelebrationEffects();
        this.updateDisplay();
    }

    updateDisplay() {
        const currentRankData = this.ranks[this.currentRank - 1];
        
        this.rankName.textContent = currentRankData.name;
        
        const isMaxRank = this.currentRank === this.ranks.length;

        if (isMaxRank) {
            this.xpToNextRank.textContent = "∞";
            const progress = (this.currentXP / currentRankData.maxXP) * 100;
            this.progressBar.style.width = `${Math.min(progress, 100)}%`;
            this.progressText.textContent = `MAX RANK (${this.currentXP} XP)`;
        } else {
            const nextRankData = this.ranks[this.currentRank];
            this.xpToNextRank.textContent = `${currentRankData.maxXP - this.currentXP}`;
            const progress = (this.currentXP / currentRankData.maxXP) * 100;
            this.progressBar.style.width = `${progress}%`;
            this.progressText.textContent = `${this.currentXP} / ${currentRankData.maxXP} XP`;
        }

        this.updateMedalAppearance();
        this.updateRankListHighlight();
    }

    // ▼▼▼ [変更点] メダルの見た目更新を、画像ソースの変更方式に修正 ▼▼▼
    updateMedalAppearance() {
        const currentRankData = this.ranks[this.currentRank - 1];
        const medalImage = document.getElementById('rankMedalImage');

        if (medalImage) {
            medalImage.src = currentRankData.imagePath;
            medalImage.alt = `${currentRankData.name}ランクのメダル`;
        }
        
        this.progressBar.style.backgroundColor = currentRankData.color;
        this.glowEffect.style.background = `radial-gradient(circle, ${currentRankData.color}33, transparent 70%)`;
    }
    // ▲▲▲ [ここまで変更] ▲▲▲

    // ▼▼▼ [変更点] ランク一覧のアイコンも画像を使うように修正 ▼▼▼
    populateRankList() {
        this.rankList.innerHTML = '';
        this.ranks.forEach(rank => {
            const li = document.createElement('li');
            li.className = 'rank-list-item';
            li.dataset.rankId = rank.id;
            
            li.innerHTML = `
                <img src="${rank.imagePath}" alt="${rank.name}" class="rank-list-icon">
                <div class="rank-list-info">
                    <span class="name">${rank.name}</span>
                    <span class="xp">到達XP: ${rank.maxXP}</span>
                </div>
            `;
            this.rankList.appendChild(li);
        });
    }
    // ▲▲▲ [ここまで変更] ▲▲▲

    updateRankListHighlight() {
        document.querySelectorAll('.rank-list-item').forEach(item => {
            item.classList.remove('current-rank');
            if (parseInt(item.dataset.rankId) === this.currentRank) {
                item.classList.add('current-rank');
            }
        });
    }
    
    playEnhancedRotationAnimation() {
        if (this.currentRank <= 1) return;
        const previousRankData = this.ranks[this.currentRank - 2];
        const rotations = previousRankData.rotations;
        const styleSheet = document.styleSheets[0];
        const keyframes = `
            @keyframes enhancedRotation {
                0% { transform: rotateY(0) rotateZ(0) scale(1); }
                20% { transform: rotateY(${rotations / 3 * 360}deg) rotateZ(10deg) scale(1.2); }
                80% { transform: rotateY(${rotations / 3 * 2 * 360}deg) rotateZ(-10deg) scale(1.2); }
                100% { transform: rotateY(${rotations * 360}deg) rotateZ(0) scale(1); }
            }`;
        
        const existingAnimation = Array.from(styleSheet.cssRules).findIndex(rule => rule.name === 'enhancedRotation');
        if (existingAnimation > -1) styleSheet.deleteRule(existingAnimation);

        styleSheet.insertRule(keyframes, styleSheet.cssRules.length);
        
        this.medalContainer.style.animation = 'none';
        void this.medalContainer.offsetWidth; // Trigger reflow
        this.medalContainer.style.animation = `enhancedRotation 3s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards`;
        
        setTimeout(() => {
            this.medalContainer.style.animation = `float 3s ease-in-out infinite`;
        }, 3000);
    }

    playCelebrationEffects() {
        const appRoot = document.getElementById('app-root');
        for (let i = 0; i < this.confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = this.ranks[Math.floor(Math.random() * this.ranks.length)].color;
            confetti.style.animationDelay = Math.random() * 2 + 's';
            appRoot.appendChild(confetti);
            setTimeout(() => confetti.remove(), 5000);
        }
    }
}

/**
 * ▼▼▼ [ここから変更] 既存コードへの統合部分 ▼▼▼
 


// ランクページ初期化関数

/*
function initializeRankPage() {
    if (!rankSystemInstance) {
        rankSystemInstance = new RankSystem();
    }
}
*/
