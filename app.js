/* 1) Supabase 初期化 */
console.log(“app.js が実行されました”);

const { createClient } = window.supabase;
const db = createClient(
‘https://hccairtzksnnqdujalgv.supabase.co’,
‘eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k’
);

/* 2) グローバル変数 */
let globalUID = null;
let html5QrCode = null;
let articlesCache = [];
const ARTICLES_PER_PAGE = 10;
let currentPage = 0;
let currentCategory = ‘all’;
let isLoadingMore = false;
let isInitialAuthCheckDone = false;
let imageObserver = null;
const pendingActions = [];

const appData = {
qrString: “ROUTE227_STAMP_2025”
};

/* 3) メイン処理 */
document.addEventListener(‘DOMContentLoaded’, () => {
setupStaticEventListeners();
setupOfflineDetection();
setupImageLazyLoading();

db.auth.onAuthStateChange(async (event, session) => {
const previousUID = globalUID;
globalUID = session?.user?.id || null;
updateUserStatus(session);

```
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
    // オンラインなら保留中のアクションを処理
    if (navigator.onLine) {
      processPendingActions();
    }
  }

  if (event === 'SIGNED_OUT') {
    sessionStorage.removeItem('activeSection');
    window.location.reload();
  }
}
```

});
});

/* 4) ユーティリティ関数 */
// HTMLエスケープ関数
function escapeHtml(unsafe) {
if (!unsafe) return ‘’;
return unsafe
.toString()
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, “>”)
.replace(/”/g, “"”)
.replace(/’/g, “'”);
}

// リトライ機能付きfetch
async function fetchWithRetry(fn, maxRetries = 3, delay = 1000) {
for (let i = 0; i < maxRetries; i++) {
try {
return await fn();
} catch (error) {
if (i === maxRetries - 1) throw error;

```
  // ユーザーに再試行中であることを通知
  if (i > 0) {
    showToast(`接続エラー。再試行中... (${i + 1}/${maxRetries})`, 'warning');
  }
  await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
}
```

}
}

// トースト通知システム
function showToast(message, type = ‘info’, duration = 3000) {
const toast = document.getElementById(‘toast-notification’);
if (!toast) return;

toast.textContent = message;
toast.className = `toast-${type} show`;

clearTimeout(toast.hideTimeout);
toast.hideTimeout = setTimeout(() => {
toast.classList.remove(‘show’);
}, duration);
}

// スクリーンリーダー向けの通知
function announceToScreenReader(message) {
const announcement = document.createElement(‘div’);
announcement.setAttribute(‘role’, ‘status’);
announcement.setAttribute(‘aria-live’, ‘polite’);
announcement.className = ‘sr-only’;
announcement.textContent = message;
document.body.appendChild(announcement);
setTimeout(() => announcement.remove(), 1000);
}

// オフライン検知
function setupOfflineDetection() {
let isOffline = !navigator.onLine;

window.addEventListener(‘online’, () => {
if (isOffline) {
showToast(‘オンラインに復帰しました’, ‘success’);
isOffline = false;
// 保留中の操作を実行
processPendingActions();
}
});

window.addEventListener(‘offline’, () => {
isOffline = true;
showToast(‘オフラインです。一部機能が制限されます。’, ‘warning’);
});
}

// 画像の遅延読み込み設定
function setupImageLazyLoading() {
if (‘IntersectionObserver’ in window) {
imageObserver = new IntersectionObserver((entries, observer) => {
entries.forEach(entry => {
if (entry.isIntersecting) {
const image = entry.target;
image.src = image.dataset.src;
image.classList.remove(‘lazy-image’);
image.classList.add(‘loaded’);
observer.unobserve(image);
}
});
}, {
rootMargin: ‘50px 0px’,
threshold: 0.01
});
}
}

// オフライン時のアクションをキューに保存
function queueAction(action) {
pendingActions.push({
...action,
timestamp: Date.now()
});
localStorage.setItem(‘pendingActions’, JSON.stringify(pendingActions));
}

// 保留中のアクションを処理
async function processPendingActions() {
const stored = localStorage.getItem(‘pendingActions’);
if (!stored) return;

const actions = JSON.parse(stored);
for (const action of actions) {
try {
await executeAction(action);
showToast(‘保留中の操作を実行しました’, ‘success’);
} catch (error) {
console.error(‘Failed to process pending action:’, error);
}
}

localStorage.removeItem(‘pendingActions’);
pendingActions.length = 0;
}

// アクションの実行
async function executeAction(action) {
switch (action.type) {
case ‘ADD_STAMP’:
await addStamp();
break;
case ‘REDEEM_REWARD’:
await redeemReward(action.rewardType);
break;
default:
console.warn(‘Unknown action type:’, action.type);
}
}

/* 5) ナビゲーションと表示切替 */
function setupStaticEventListeners() {
document.querySelectorAll(’.nav-link’).forEach(link => {
link.addEventListener(‘click’, (e) => {
const sectionId = e.currentTarget.dataset.section;
sessionStorage.setItem(‘activeSection’, sectionId);
showSection(sectionId);
});
});

document.getElementById(‘load-more-btn’)?.addEventListener(‘click’, () => {
if (isLoadingMore) return;
currentPage++;
renderArticles(currentCategory, false);
});

const emailForm = document.getElementById(‘email-form’);
const otpForm = document.getElementById(‘otp-form’);
const emailInput = document.getElementById(‘email’);
const otpCodeInput = document.getElementById(‘otp-code’);
const emailMessage = document.getElementById(‘email-message’);
const otpMessage = document.getElementById(‘otp-message’);
const otpEmailDisplay = document.getElementById(‘otp-email-display’);
const changeEmailBtn = document.getElementById(‘change-email-btn’);

emailForm?.addEventListener(‘submit’, async (e) => {
e.preventDefault();
const email = emailInput.value.trim();
const submitButton = emailForm.querySelector(‘button[type=“submit”]’);
submitButton.disabled = true;
submitButton.textContent = ‘送信中…’;
emailMessage.textContent = ‘’;

```
try {
  const { error } = await fetchWithRetry(() => 
    db.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true }})
  );
  if (error) throw error;
  
  emailMessage.textContent = '✅ メールを確認してください！';
  showToast('認証メールを送信しました', 'success');
  otpEmailDisplay.textContent = email;
  emailForm.classList.add('hidden');
  otpForm.classList.remove('hidden');
} catch (err) {
  emailMessage.textContent = `❌ ${err.message || 'エラーが発生しました。'}`;
  showToast('メール送信に失敗しました', 'error');
} finally {
  submitButton.disabled = false; 
  submitButton.textContent = '認証コードを送信';
}
```

});

otpForm?.addEventListener(‘submit’, async (e) => {
e.preventDefault();
const email = otpEmailDisplay.textContent;
const token = otpCodeInput.value.trim();
const submitButton = otpForm.querySelector(‘button[type=“submit”]’);
submitButton.disabled = true;
submitButton.textContent = ‘認証中…’;
otpMessage.textContent = ‘’;

```
try {
  const { data, error } = await fetchWithRetry(() =>
    db.auth.verifyOtp({ email: email, token: token, type: 'email' })
  );
  if (error) throw error;
  
  showToast('ログインしました', 'success');
  closeModal(document.getElementById('login-modal'));
} catch (err) {
  otpMessage.textContent = `❌ ${err.message || '認証に失敗しました。'}`;
  showToast('認証コードが正しくありません', 'error');
} finally {
  submitButton.disabled = false; 
  submitButton.textContent = '認証する';
}
```

});

changeEmailBtn?.addEventListener(‘click’, () => {
otpForm.classList.add(‘hidden’);
emailForm.classList.remove(‘hidden’);
emailMessage.textContent = ‘’;
otpMessage.textContent = ‘’;
});

document.body.addEventListener(‘click’, (e) => {
if (e.target.matches(’.close-modal’) || e.target.matches(’.close-notification’)) {
const modal = e.target.closest(’.modal’);
if (modal) closeModal(modal);
}
if (e.target.matches(’.modal’)) {
closeModal(e.target);
}
});

// キーボードイベントの追加
document.addEventListener(‘keydown’, (e) => {
if (e.key === ‘Escape’) {
const activeModal = document.querySelector(’.modal.active’);
if (activeModal) {
closeModal(activeModal);
}
}
});

initializeNotificationButton();
}

async function showSection(sectionId, isInitialLoad = false) {
const appLoader = document.getElementById(‘app-loader’);
if (!isInitialLoad) appLoader.classList.add(‘active’);

document.querySelectorAll(’.section’).forEach(s => s.classList.remove(‘active’));
document.querySelectorAll(’.nav-link’).forEach(l => {
l.classList.toggle(‘active’, l.dataset.section === sectionId);
});

const sectionElement = document.getElementById(sectionId);
if (sectionElement) {
sectionElement.classList.add(‘active’);
if (sectionId === ‘feed-section’) await initializeFeedPage();
else if (sectionId === ‘foodtruck-section’) initializeFoodtruckPage();
else if (sectionId === ‘rank-section’) initializeRankPage();

```
// セクション変更をスクリーンリーダーに通知
const sectionName = {
  'feed-section': 'フィード',
  'foodtruck-section': 'スタンプカード',
  'rank-section': 'ランク'
}[sectionId];
announceToScreenReader(`${sectionName}セクションに移動しました`);
```

}

if (!isInitialLoad) {
setTimeout(() => appLoader.classList.remove(‘active’), 100);
}
}

function updateUserStatus(session) {
const userStatusDiv = document.getElementById(‘user-status’);
if (userStatusDiv) {
userStatusDiv.innerHTML = session ? ‘<button id="logout-button" class="btn">ログアウト</button>’ : ‘’;
if (session) {
document.getElementById(‘logout-button’).addEventListener(‘click’, () => {
if (confirm(‘ログアウトしますか？’)) {
db.auth.signOut();
}
});
}
}
}

/* 6) ページ別初期化ロジック */
async function initializeFeedPage() {
const categoryTabs = document.getElementById(‘category-tabs’);
if (categoryTabs && !categoryTabs.dataset.listenerAttached) {
categoryTabs.dataset.listenerAttached = ‘true’;
categoryTabs.addEventListener(‘click’, (e) => {
if (e.target.classList.contains(‘category-tab’)) {
currentPage = 0;
currentCategory = e.target.dataset.category;
document.querySelectorAll(’.category-tab’).forEach(t => t.classList.remove(‘active’));
e.target.classList.add(‘active’);
renderArticles(currentCategory, true);
}
});
}

currentPage = 0;
currentCategory = ‘all’;
document.querySelectorAll(’.category-tab’).forEach(t => t.classList.toggle(‘active’, t.dataset.category === ‘all’));

renderArticles(currentCategory, true);
}

function initializeFoodtruckPage() {
updateFoodtruckInfo();
if (!globalUID) {
document.getElementById(‘login-modal’).classList.add(‘active’);
updateStampDisplay(0);
updateRewardButtons(0);
return;
}

updateStampDisplay(0);
updateRewardButtons(0);
setupFoodtruckActionListeners();

(async () => {
try {
const stampCount = await fetchWithRetry(() => fetchUserRow(globalUID));
updateStampDisplay(stampCount);
updateRewardButtons(stampCount);
} catch (error) {
console.error(“Failed to fetch stamp count in background:”, error);
showToast(‘スタンプ情報の取得に失敗しました’, ‘error’);
}
})();
}

/* 7) ヘルパー関数群 */
function setupFoodtruckActionListeners() {
const foodtruckSection = document.getElementById(‘foodtruck-section’);
if (!foodtruckSection || foodtruckSection.dataset.listenersAttached === ‘true’) {
return;
}
foodtruckSection.dataset.listenersAttached = ‘true’;

document.getElementById(‘scan-qr’)?.addEventListener(‘click’, initQRScanner);
document.getElementById(‘coffee-reward’)?.addEventListener(‘click’, () => redeemReward(‘coffee’));
document.getElementById(‘curry-reward’)?.addEventListener(‘click’, () => redeemReward(‘curry’));
}

function closeModal(modalElement) {
if(!modalElement) return;
modalElement.classList.remove(‘active’);
if (modalElement.id === ‘qr-modal’ && html5QrCode && html5QrCode.isScanning) {
html5QrCode.stop().catch(console.error);
}

// フォーカスを戻す
const trigger = modalElement.dataset.trigger;
if (trigger) {
document.getElementById(trigger)?.focus();
}
}

// モーダルを開く際にフォーカストラップを設定
function openModal(modalElement, triggerId) {
modalElement.classList.add(‘active’);
modalElement.dataset.trigger = triggerId;
trapFocus(modalElement);
}

// フォーカストラップ
function trapFocus(modal) {
const focusableElements = modal.querySelectorAll(
‘button, [href], input, select, textarea, [tabindex]:not([tabindex=”-1”])’
);
const firstFocusable = focusableElements[0];
const lastFocusable = focusableElements[focusableElements.length - 1];

modal.addEventListener(‘keydown’, function trapHandler(e) {
if (e.key === ‘Tab’) {
if (e.shiftKey && document.activeElement === firstFocusable) {
e.preventDefault();
lastFocusable.focus();
} else if (!e.shiftKey && document.activeElement === lastFocusable) {
e.preventDefault();
firstFocusable.focus();
}
}
});

// 最初の要素にフォーカス
setTimeout(() => firstFocusable?.focus(), 100);
}

async function fetchUserRow(uid) {
try {
const { data, error } = await db
.from(‘users’)
.select(‘stamp_count’)
.eq(‘supabase_uid’, uid)
.maybeSingle();

```
if (error) throw error;
return data?.stamp_count || 0;
```

} catch (err) {
showNotification(‘データベースエラー’, ‘ユーザー情報の取得に失敗しました。’);
throw err;
}
}

async function updateStampCount(uid, newCount) {
try {
const { data, error } = await db.from(‘users’)
.update({ stamp_count: newCount, updated_at: new Date().toISOString() })
.eq(‘supabase_uid’, uid)
.select()
.single();
if (error) throw error;
return data.stamp_count;
} catch(err) {
showNotification(‘エラー’, ‘スタンプの保存に失敗しました。’);
throw err;
}
}

function updateStampDisplay(count) {
document.querySelectorAll(’.stamp’).forEach((el, i) => {
if (i < count && !el.classList.contains(‘active’)) {
// 新しく獲得したスタンプにアニメーション
setTimeout(() => {
el.classList.add(‘active’);
el.style.animation = ‘stamp-celebrate 0.6s ease-out’;
createParticles(el);
}, i * 100);
} else {
el.classList.toggle(‘active’, i < count);
}
});
}

// パーティクルエフェクト
function createParticles(element) {
const rect = element.getBoundingClientRect();
const particles = 15;

for (let i = 0; i < particles; i++) {
const particle = document.createElement(‘div’);
particle.className = ‘particle’;
particle.style.left = `${rect.left + rect.width / 2}px`;
particle.style.top = `${rect.top + rect.height / 2}px`;
particle.style.setProperty(’–angle’, `${(360 / particles) * i}deg`);
particle.style.backgroundColor = [’#FFD700’, ‘#E9C46A’, ‘#F4A261’][Math.floor(Math.random() * 3)];
document.body.appendChild(particle);

```
setTimeout(() => particle.remove(), 1000);
```

}
}

function updateRewardButtons(count) {
const coffeeBtn = document.getElementById(‘coffee-reward’);
const curryBtn = document.getElementById(‘curry-reward’);
const coffeeItem = document.getElementById(‘coffee-reward-item’);
const curryItem = document.getElementById(‘curry-reward-item’);

if (coffeeBtn) coffeeBtn.disabled = count < 3;
if (curryBtn) curryBtn.disabled = count < 6;
coffeeItem?.classList.toggle(‘available’, count >= 3);
curryItem?.classList.toggle(‘available’, count >= 6);
}

function showNotification(title, msg) {
const modal = document.getElementById(‘notification-modal’);
if(modal){
document.getElementById(‘notification-title’).textContent = title;
document.getElementById(‘notification-message’).innerHTML = msg;
openModal(modal, document.activeElement.id);
}
}

async function addStamp() {
if (!globalUID) {
showNotification(‘ログインが必要です’, ‘スタンプを獲得するにはログインしてください。’);
document.getElementById(‘login-modal’).classList.add(‘active’);
return;
}

// オフラインの場合
if (!navigator.onLine) {
queueAction({ type: ‘ADD_STAMP’ });
showToast(‘オフラインです。オンライン復帰後にスタンプを追加します。’, ‘warning’);
return;
}

try {
const count = await fetchWithRetry(() => fetchUserRow(globalUID));
if (count >= 6) {
showNotification(‘コンプリート！’, ‘スタンプが6個たまりました！<br>特典と交換してください。’);
return;
}

```
const newCount = await fetchWithRetry(() => updateStampCount(globalUID, count + 1));
updateStampDisplay(newCount);
updateRewardButtons(newCount);

// 適切なフィードバック
if (newCount === 3) {
  showNotification('🎉 特典解除！', 'コーヒー1杯と交換できます！<br>あと3スタンプでカレー1杯無料！');
} else if (newCount === 6) {
  showNotification('🎊 コンプリート！', '全てのスタンプを集めました！<br>カレー1杯と交換できます！');
} else {
  showNotification('スタンプ獲得', `現在 ${newCount} 個（あと${6 - newCount}個でカレー無料）`);
}

announceToScreenReader(`スタンプを獲得しました。現在${newCount}個です。`);
```

} catch (error) {
console.error(‘Stamp addition failed:’, error);
showNotification(‘エラー’, ‘スタンプの追加に失敗しました。<br>インターネット接続を確認してください。’);
}
}

async function redeemReward(type) {
if (!globalUID) return;

// オフラインの場合
if (!navigator.onLine) {
queueAction({ type: ‘REDEEM_REWARD’, rewardType: type });
showToast(‘オフラインです。オンライン復帰後に特典を交換します。’, ‘warning’);
return;
}

try {
const count = await fetchWithRetry(() => fetchUserRow(globalUID));
const required = type === ‘coffee’ ? 3 : 6;
if (count < required) return;

```
if (!confirm(`${type === 'coffee' ? 'コーヒー' : 'カレー'}と交換しますか？\n（スタンプが${required}個消費されます）`)) {
  return;
}

const newCount = await fetchWithRetry(() => updateStampCount(globalUID, count - required));
updateStampDisplay(newCount);
updateRewardButtons(newCount);
showNotification('交換完了', `${type === 'coffee' ? 'コーヒー' : 'カレー'}と交換しました！<br>店舗でスタッフにお見せください。`);
showToast('特典を交換しました！', 'success');

announceToScreenReader(`${type === 'coffee' ? 'コーヒー' : 'カレー'}と交換しました。`);
```

} catch (error) {
showNotification(‘エラー’, ‘特典の交換に失敗しました。’);
}
}

function initQRScanner() {
const qrModal = document.getElementById(‘qr-modal’);
openModal(qrModal, ‘scan-qr’);

let isProcessing = false;
html5QrCode = new Html5Qrcode(‘qr-reader’);
html5QrCode.start(
{ facingMode: ‘environment’ },
{ fps: 10, qrbox: { width: 250, height: 250 } },
async (decodedText) => {
if (isProcessing) return;
isProcessing = true;
if (html5QrCode.isScanning) await html5QrCode.stop();
closeModal(qrModal);
if (decodedText === appData.qrString) {
await addStamp();
} else {
showNotification(‘無効なQR’, ‘お店のQRコードではありません。’);
}
},
(errorMessage) => {}
).catch(() => {
document.getElementById(‘qr-reader’).innerHTML = ‘<p style="color: red;">カメラの起動に失敗しました</p>’;
showToast(‘カメラへのアクセスが拒否されました’, ‘error’);
});
}

// 記事カードの作成（改善版）
function createArticleCard(cardData) {
const placeholderUrl = ‘data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjI1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkxvYWRpbmcuLi48L3RleHQ+PC9zdmc+’;
const fallbackUrl = ‘https://via.placeholder.com/400x250.png?text=Route227’;

const div = document.createElement(‘div’);
div.className = ‘card’;

const imageUrl = cardData.image_url || fallbackUrl;

div.innerHTML = ` <div class="article-link" data-article-id="${cardData.id}" role="button" tabindex="0"> <div class="image-container"> <img  src="${placeholderUrl}"  data-src="${escapeHtml(imageUrl)}" alt="${escapeHtml(cardData.title)}のサムネイル"  loading="lazy" class="article-image lazy-image" onerror="this.onerror=null;this.src='${fallbackUrl}';" > </div> <div class="card-body"> <h3 class="article-title">${escapeHtml(cardData.title)}</h3> <p class="article-excerpt">${escapeHtml(cardData.summary)}</p> </div> </div>`;

// 画像の遅延読み込み
const img = div.querySelector(’.lazy-image’);
if (imageObserver) {
imageObserver.observe(img);
} else {
// IntersectionObserverがサポートされていない場合
img.src = img.dataset.src;
}

return div;
}

function renderArticles(category, clearContainer) {
const articlesContainer = document.getElementById(‘articles-container’);
const loadMoreBtn = document.getElementById(‘load-more-btn’);
if (!articlesContainer || !loadMoreBtn) return;

isLoadingMore = true;
if (clearContainer) {
articlesContainer.innerHTML = ‘<div class="loading-spinner"></div>’;
articlesCache = [];
} else {
loadMoreBtn.textContent = ‘読み込み中…’;
loadMoreBtn.disabled = true;
}

(async () => {
try {
const from = currentPage * ARTICLES_PER_PAGE;
const to = from + ARTICLES_PER_PAGE - 1;

```
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
    const fragment = document.createDocumentFragment();
    newArticles.forEach(cardData => {
      fragment.appendChild(createArticleCard(cardData));
    });
    articlesContainer.appendChild(fragment);
  }

  if (newArticles.length < ARTICLES_PER_PAGE) {
    loadMoreBtn.classList.remove('visible');
  } else {
    loadMoreBtn.classList.add('visible');
  }

  // イベントリスナーの設定
  document.querySelectorAll('.article-link').forEach(link => {
    if(link.dataset.listenerAttached) return;
    link.dataset.listenerAttached = 'true';
    link.addEventListener('click', (e) => {
      const articleId = e.currentTarget.dataset.articleId;
      showSummaryModal(parseInt(articleId, 10));
    });
    // キーボードアクセシビリティ
    link.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const articleId = e.currentTarget.dataset.articleId;
        showSummaryModal(parseInt(articleId, 10));
      }
    });
  });

} catch (error) {
  console.error("記事の読み込みエラー:", error);
  articlesContainer.innerHTML = '<div class="status status--error">記事の読み込みに失敗しました。</div>';
  showToast('記事の読み込みに失敗しました', 'error');
} finally {
  isLoadingMore = false;
  loadMoreBtn.textContent = 'さらに読み込む';
  loadMoreBtn.disabled = false;
}
```

})();
}

function showSummaryModal(articleId) {
const article = articlesCache.find(a => a.id === articleId);
if (!article) return;

const modal = document.getElementById(‘summary-modal’);
const imgEl = document.getElementById(‘summary-image’);
const titleEl = document.getElementById(‘summary-title’);
const bulletsEl = document.getElementById(‘summary-bullets’);
const readMoreBtn = document.getElementById(‘summary-read-more’);

const placeholderUrl = ‘https://via.placeholder.com/400x250.png?text=Route227’;
const imageUrl = article.image_url || placeholderUrl;
imgEl.style.backgroundImage = `url('${imageUrl}')`;

titleEl.textContent = article.title;

// summary_pointsの安全な処理
if (article.summary_points && Array.isArray(article.summary_points)) {
bulletsEl.innerHTML = article.summary_points
.map(point => `<li>${escapeHtml(point).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`)
.join(’’);
} else {
bulletsEl.innerHTML = ‘’;
}

const articleUrl = article.article_url?.trim();
if (!articleUrl) {
readMoreBtn.style.display = ‘none’;
} else {
readMoreBtn.href = articleUrl;
readMoreBtn.style.display = ‘flex’;
}

openModal(modal, ‘articles-container’);
}

function promiseWithTimeout(promise, ms, timeoutError = new Error(‘Promise timed out’)) {
const timeout = new Promise((_, reject) => {
const id = setTimeout(() => {
clearTimeout(id);
reject(timeoutError);
}, ms);
});
return Promise.race([promise, timeout]);
}

function handleUrlHash() {
const hash = window.location.hash;

if (hash && hash.startsWith(’#article-’)) {
const articleId = parseInt(hash.substring(9), 10);
if (isNaN(articleId)) return;

```
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
```

}
}

function initializeNotificationButton() {
const container = document.getElementById(‘notification-button-container’);
if (!container) return;

const icons = {
granted: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
denied: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
default: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

const updateButton = (permission) => {
let iconHtml = ‘’;
let clickHandler = () => {};

```
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
  default:
    iconHtml = icons.default;
    clickHandler = () => {
      OneSignal.Notifications.requestPermission();
    };
    break;
}
container.innerHTML = `<button type="button" aria-label="通知設定">${iconHtml}</button>`;
container.querySelector('button')?.addEventListener('click', clickHandler);
```

};

window.OneSignalDeferred.push(function(OneSignal) {
OneSignal.Notifications.addEventListener(‘permissionChange’, (permission) => {
updateButton(permission);
});

```
updateButton(OneSignal.Notifications.permission);
```

});
}

// PWA判定
window.addEventListener(‘DOMContentLoaded’, () => {
const isPWA =
window.matchMedia(’(display-mode: standalone)’).matches ||
window.navigator.standalone === true;

if (isPWA) {
document.body.classList.add(‘pwa’);
}
});

// PWAバナー
window.addEventListener(‘DOMContentLoaded’, () => {
const isStandalone = window.matchMedia(’(display-mode: standalone)’).matches;

if (!isStandalone) {
const banner = document.getElementById(‘pwa-banner’);
const closeBtn = document.getElementById(‘pwa-banner-close’);
const bannerImage = document.getElementById(‘pwa-banner-image’);

```
const isAndroid = /Android/i.test(navigator.userAgent);

if (isAndroid) {
  bannerImage.src = 'assets/addhome2.png';
}

banner.classList.remove('hidden');

closeBtn.addEventListener('click', () => {
  banner.classList.add('hidden');
});
```

}
});

// ページキャッシュからの復元時にリロード
window.addEventListener(‘pageshow’, function(event) {
if (event.persisted) {
window.location.reload();
}
});

// 今日の出店情報を取得（改善版）
async function updateFoodtruckInfo() {
const infoContainer = document.getElementById(‘today-info-container’);
const imageContainer = document.getElementById(‘schedule-image-container’);

if (!infoContainer || !imageContainer) {
console.error(‘Error: HTML要素が見つかりません。’);
return;
}

infoContainer.innerHTML = ‘<p>情報を読み込んでいます…</p>’;
imageContainer.style.display = ‘none’;
imageContainer.src = ‘’;

try {
const today = new Date();
today.setHours(today.getHours() + 9);
const todayString = today.toISOString().split(‘T’)[0];
console.log(`[OK] 本日の日付 (${todayString}) で情報を検索します。`);

```
const { data, error } = await fetchWithRetry(() =>
  db.from('schedule')
    .select('message, image_name')
    .eq('date', todayString)
    .single()
);

if (error && error.code !== 'PGRST116') throw error;

if (data) {
  console.log('[OK] データが見つかりました:', data);
  infoContainer.innerHTML = `<p>${data.message ? escapeHtml(data.message).replace(/\n/g, '<br>') : 'メッセージがありません'}</p>`;

  if (data.image_name && data.image_name.startsWith('http')) {
    console.log('[OK] DBから画像のURLを直接取得しました:', data.image_name);
    
    imageContainer.src = data.image_name;

    imageContainer.onload = () => {
      console.log('[SUCCESS] 画像のロードが完了し、表示します。');
      imageContainer.style.display = 'block';
    };
    imageContainer.onerror = () => {
      console.error('[FAIL] 画像のロードに失敗しました。');
      showToast('画像の読み込みに失敗しました', 'error');
    };

  } else {
    console.log('[INFO] この日のデータに画像URLは登録されていません。');
  }

} else {
  console.log('[INFO] 本日の出店情報データは見つかりませんでした。');
  infoContainer.innerHTML = '<p>本日の出店はありません。</p>';
}
```

} catch (err) {
console.error(’[FATAL] 処理中に致命的なエラーが発生しました。’, err);
infoContainer.innerHTML = ‘<p>エラーが発生しました。情報の取得に失敗しました。</p>’;
showToast(‘出店情報の取得に失敗しました’, ‘error’);
}
}

// ランクページ初期化（現在は無効化されているが、将来の実装用に残す）
function initializeRankPage() {
// 将来の実装用
console.log(‘Rank page initialization placeholder’);
}

// スクリーンリーダー用のスタイル
const srOnlyStyle = document.createElement(‘style’);
srOnlyStyle.textContent = `.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }`;
document.head.appendChild(srOnlyStyle);
