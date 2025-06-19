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

   if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => console.log('✅ Service Worker registered:', reg))
      .catch((err) => console.error('❌ Service Worker registration failed:', err));
  }

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
}

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
    else if (sectionId === 'foodtruck-section') initializeFoodtruckPage(); // ここはawaitしない
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
  
  // renderArticlesを直接awaitせず、分離して呼び出す
  renderArticles(currentCategory, true);
}

function initializeFoodtruckPage() {
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
    document.getElementById('notification-message').textContent = msg;
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
    if (count === 3 || count === 6) showNotification('🎉', count === 3 ? 'コーヒー1杯無料！' : 'カレー1杯無料！');
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

// ★★★ フィード表示も抜本対策を適用 ★★★
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

  // データ取得をバックグラウンドで実行
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
          articlesContainer.innerHTML = ''; // スピナーを消す
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
    readMoreBtn.href = article.article_url;
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
