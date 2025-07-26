/* 1) Supabase 初期化 */
console.log("app.js が実行されました");

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
let imageObserver = null;
const pendingActions = [];
let authEmail = ''; // 認証フローで使うメールアドレスを保持

const appData = {
  qrString: "ROUTE227_STAMP_2025"
};

/* 3) メイン処理 */
document.addEventListener('DOMContentLoaded', () => {
  setupStaticEventListeners();
  setupOfflineDetection();
  setupImageLazyLoading();

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      const modal = document.getElementById('login-modal');
      switchAuthStep('message-step');
      document.getElementById('message-text').textContent = 'パスワードを更新しました。新しいパスワードでログインしてください。';
      if (!modal.classList.contains('active')) {
        openModal(modal);
      }
    }

    const previousUID = globalUID;
    globalUID = session?.user?.id || null;
    updateUserStatus(session);

    if (!isInitialAuthCheckDone) {
      isInitialAuthCheckDone = true;
      const appLoader = document.getElementById('app-loader');
      if (appLoader.classList.contains('active')) {
          appLoader.classList.remove('active');
      }

      try {
        const lastSection = sessionStorage.getItem('activeSection') || 'feed-section';
        await showSection(lastSection, true);
        handleUrlHash();
      } catch (error) {
        console.error("[INIT] Critical error during initial load:", error);
        await showSection('feed-section', true);
      }
    } else {
      if (event === 'SIGNED_IN' && !previousUID && globalUID) {
        const currentActiveSectionId = document.querySelector('.section.active')?.id || 'foodtruck-section';
        await showSection(currentActiveSectionId, false);
        if (navigator.onLine) {
          processPendingActions();
        }
      }

      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('activeSection');
        window.location.reload();
      }
    }
  });
});


/* 4) ユーティリティ関数 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function fetchWithRetry(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      if (i > 0) {
        showToast(`接続エラー。再試行中... (${i + 1}/${maxRetries})`, 'warning');
      }
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast-${type} show`;
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function announceToScreenReader(message) {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  document.body.appendChild(announcement);
  setTimeout(() => announcement.remove(), 1000);
}

function setupOfflineDetection() {
  let isOffline = !navigator.onLine;
  window.addEventListener('online', () => {
    if (isOffline) {
      showToast('オンラインに復帰しました', 'success');
      isOffline = false;
      processPendingActions();
    }
  });
  window.addEventListener('offline', () => {
    isOffline = true;
    showToast('オフラインです。一部機能が制限されます。', 'warning');
  });
}

function setupImageLazyLoading() {
  if ('IntersectionObserver' in window) {
    imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const image = entry.target;
          image.src = image.dataset.src;
          image.classList.remove('lazy-image');
          image.classList.add('loaded');
          observer.unobserve(image);
        }
      });
    }, { rootMargin: '50px 0px', threshold: 0.01 });
  }
}

function queueAction(action) {
  pendingActions.push({ ...action, timestamp: Date.now() });
  localStorage.setItem('pendingActions', JSON.stringify(pendingActions));
}

async function processPendingActions() {
  const stored = localStorage.getItem('pendingActions');
  if (!stored) return;
  const actions = JSON.parse(stored);
  for (const action of actions) {
    try {
      await executeAction(action);
      showToast('保留中の操作を実行しました', 'success');
    } catch (error) {
      console.error('Failed to process pending action:', error);
    }
  }
  localStorage.removeItem('pendingActions');
  pendingActions.length = 0;
}

async function executeAction(action) {
  switch (action.type) {
    case 'ADD_STAMP': await addStamp(); break;
    case 'REDEEM_REWARD': await redeemReward(action.rewardType); break;
    default: console.warn('Unknown action type:', action.type);
  }
}


/* 5) 認証関連の関数 */
function switchAuthStep(stepId) {
    const steps = ['email-step', 'password-step', 'register-step', 'message-step'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === stepId) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

function validatePassword(password) {
    const policies = {
        length: password.length >= 8,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        number: /\d/.test(password)
    };
    document.getElementById('policy-length')?.classList.toggle('valid', policies.length);
    document.getElementById('policy-lowercase')?.classList.toggle('valid', policies.lowercase);
    document.getElementById('policy-uppercase')?.classList.toggle('valid', policies.uppercase);
    document.getElementById('policy-number')?.classList.toggle('valid', policies.number);
    return Object.values(policies).every(Boolean);
}

async function handleEmailNext() {
    const emailInput = document.getElementById('auth-email');
    const messageEl = document.getElementById('email-step-message');
    const button = document.getElementById('email-next-btn');

    authEmail = emailInput.value.trim();
    if (messageEl) messageEl.textContent = '';
    
    if (!authEmail) {
        if (messageEl) messageEl.textContent = 'メールアドレスを入力してください。';
        return;
    }

    button.disabled = true;
    button.textContent = '確認中…';

    try {
        const { data: userExists, error } = await db.rpc('check_user_exists', { user_email: authEmail });
        if (error) throw error;
        
        if (userExists) {
            document.getElementById('password-email-display').textContent = authEmail;
            switchAuthStep('password-step');
        } else {
            document.getElementById('register-email-display').textContent = authEmail;
            switchAuthStep('register-step');
        }
    } catch (err) {
        if (messageEl) messageEl.textContent = 'エラーが発生しました。時間をおいて再試行してください。';
        console.error('User check error:', err);
    } finally {
        button.disabled = false;
        button.textContent = '次へ';
    }
}

async function handleLogin() {
    const passwordInput = document.getElementById('auth-password');
    const messageEl = document.getElementById('password-step-message');
    const button = document.getElementById('login-btn');
    const password = passwordInput.value;
    if (messageEl) messageEl.textContent = '';

    button.disabled = true;
    button.textContent = 'ログイン中…';

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email: authEmail,
            password: password,
        });

        if (error) {
            // 既存ユーザーでパスワードが未設定の場合 (Invalid login credentials)
            if (error.message.includes('Invalid login credentials')) {
                 const { data: { user } } = await db.auth.getUser();
                 // ログイン試行前にユーザーが存在することは確認済みなので、
                 // ここでエラーが出た場合はパスワードが違うか、未設定。
                 // 安全なパスワード設定フローに誘導する。
                 messageEl.textContent = 'パスワードが違うか、まだ設定されていません。';
                 showToast('パスワードが違うようです。忘れましたか？', 'warning');

            } else {
                throw error;
            }
        } else {
            closeModal(document.getElementById('login-modal'));
            showToast('ログインしました', 'success');
        }
    } catch (err) {
        if (messageEl) messageEl.textContent = 'ログインに失敗しました。';
        console.error('Login error:', err);
    } finally {
        button.disabled = false;
        button.textContent = 'ログイン';
    }
}


async function handleRegister() {
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-password-confirm');
    const messageEl = document.getElementById('register-step-message');
    const button = document.getElementById('register-btn');
    
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;
    if (messageEl) messageEl.textContent = '';

    if (password !== confirmPassword) {
        if (messageEl) messageEl.textContent = 'パスワードが一致しません。';
        return;
    }
    if (!validatePassword(password)) {
        if (messageEl) messageEl.textContent = 'パスワードが要件を満たしていません。';
        return;
    }
    
    button.disabled = true;
    button.textContent = '登録中…';

    try {
        const { error } = await db.auth.signUp({ email: authEmail, password: password });
        if (error) throw error;
        
        closeModal(document.getElementById('login-modal'));
        showToast('登録完了しました。ログインしています。', 'success');
    } catch(err) {
        if (messageEl) messageEl.textContent = err.message || '登録に失敗しました。';
        console.error('Registration error:', err);
    } finally {
        button.disabled = false;
        button.textContent = '登録してログイン';
    }
}

async function handleForgotPassword() {
    const messageStepText = document.getElementById('message-text');
    const passwordMessageEl = document.getElementById('password-step-message');
    
    // パスワード入力画面のエラーメッセージをクリア
    if(passwordMessageEl) passwordMessageEl.textContent = '';
    
    messageStepText.textContent = 'パスワード再設定（または新規設定）用のメールを送信しました。メールをご確認ください。';
    switchAuthStep('message-step');

    try {
        await db.auth.resetPasswordForEmail(authEmail, {
            redirectTo: window.location.href.split('#')[0] // URLからハッシュを除外
        });
    } catch(err) {
        console.error('Forgot password error:', err);
        messageStepText.textContent = 'エラーが発生しました。時間をおいて再試行してください。';
    }
}


/* 6) ナビゲーションと表示切替 */
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
  
  document.getElementById('email-next-btn')?.addEventListener('click', handleEmailNext);
  document.getElementById('login-btn')?.addEventListener('click', handleLogin);
  document.getElementById('register-btn')?.addEventListener('click', handleRegister);
  document.getElementById('forgot-password-link')?.addEventListener('click', handleForgotPassword);
  
  document.getElementById('register-password')?.addEventListener('input', (e) => {
      validatePassword(e.target.value);
  });

  document.body.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (e.target.matches('.close-modal') || e.target.matches('.close-notification') || e.target === modal) {
      if (modal) {
          closeModal(modal);
          if(modal.id === 'login-modal') {
              switchAuthStep('email-step');
              document.getElementById('auth-email').value = '';
              document.getElementById('auth-password').value = '';
          }
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal.active');
      if (activeModal) {
        closeModal(activeModal);
        if(activeModal.id === 'login-modal') {
          switchAuthStep('email-step');
          document.getElementById('auth-email').value = '';
          document.getElementById('auth-password').value = '';
        }
      }
    }
  });
}

async function showSection(sectionId, isInitialLoad = false) {
  const appLoader = document.getElementById('app-loader');
  if (!isInitialLoad && appLoader) appLoader.classList.add('active');

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.section === sectionId);
  });

  const sectionElement = document.getElementById(sectionId);
  if (sectionElement) {
    sectionElement.classList.add('active');
    if (sectionId === 'feed-section') await initializeFeedPage();
    else if (sectionId === 'foodtruck-section') initializeFoodtruckPage();
    else if (sectionId === 'rank-section') initializeRankPage();

    const sectionName = {
      'feed-section': 'フィード',
      'foodtruck-section': 'スタンプカード',
      'rank-section': 'ランク'
    }[sectionId];
    announceToScreenReader(`${sectionName}セクションに移動しました`);
  }

  if (!isInitialLoad && appLoader) {
    setTimeout(() => appLoader.classList.remove('active'), 100);
  }
}

function updateUserStatus(session) {
  const userStatusDiv = document.getElementById('user-status');
  if (userStatusDiv) {
    userStatusDiv.innerHTML = session ? '<button id="logout-button" class="btn">ログアウト</button>' : '';
    if (session) {
      document.getElementById('logout-button').addEventListener('click', () => {
        if (confirm('ログアウトしますか？')) {
          db.auth.signOut();
        }
      });
    }
  }
}


/* 7) ページ別初期化ロジック */
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
    const loginModal = document.getElementById('login-modal');
    if(loginModal) {
        switchAuthStep('email-step'); // ログインモーダルは初期状態に
        openModal(loginModal);
    }
    updateStampDisplay(0);
    updateRewardButtons(0);
    return;
  }
  setupFoodtruckActionListeners();
  displayRewardHistory();

  (async () => {
    try {
      const stampCount = await fetchWithRetry(() => fetchUserRow(globalUID));
      updateStampDisplay(stampCount);
      updateRewardButtons(stampCount);
    } catch (error) {
      console.error("Failed to fetch stamp count in background:", error);
      showToast('スタンプ情報の取得に失敗しました', 'error');
    }
  })();
}


/* 8) ヘルパー関数群 */
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
  if (!modalElement) return;
  modalElement.classList.remove('active');
  if (modalElement.id === 'qr-modal' && html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().catch(console.error);
  }
  const trigger = modalElement.dataset.trigger;
  if (trigger) {
    document.getElementById(trigger)?.focus();
  }
}

function openModal(modalElement, triggerId) {
  if (!modalElement) return;
  modalElement.classList.add('active');
  modalElement.dataset.trigger = triggerId;
  trapFocus(modalElement);
}

function trapFocus(modal) {
  const focusableElements = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusableElements.length === 0) return;
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  modal.addEventListener('keydown', function trapHandler(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  });
  setTimeout(() => firstFocusable?.focus(), 100);
}

async function fetchUserRow(uid) {
  try {
    const { data, error } = await db.from('users').select('stamp_count').eq('supabase_uid', uid).maybeSingle();
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
  } catch (err) {
    showNotification('エラー', 'スタンプの保存に失敗しました。');
    throw err;
  }
}

function updateStampDisplay(count) {
  document.querySelectorAll('.stamp').forEach((el, i) => {
    if (i < count && !el.classList.contains('active')) {
      setTimeout(() => {
        el.classList.add('active');
        el.style.animation = 'stamp-celebrate 0.6s ease-out';
        createParticles(el);
      }, i * 100);
    } else {
      el.classList.toggle('active', i < count);
    }
  });
}

function createParticles(element) {
  const rect = element.getBoundingClientRect();
  const particles = 15;
  for (let i = 0; i < particles; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.setProperty('--angle', `${(360 / particles) * i}deg`);
    particle.style.backgroundColor = ['#FFD700', '#E9C46A', '#F4A261'][Math.floor(Math.random() * 3)];
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1000);
  }
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
  if (modal) {
    document.getElementById('notification-title').textContent = title;
    document.getElementById('notification-message').innerHTML = msg;
    openModal(modal, document.activeElement?.id);
  }
}

async function addStamp() {
  if (!globalUID) {
    openModal(document.getElementById('login-modal'));
    return;
  }
  if (!navigator.onLine) {
    queueAction({ type: 'ADD_STAMP' });
    showToast('オフラインです。オンライン復帰後にスタンプを追加します。', 'warning');
    return;
  }
  try {
    const count = await fetchWithRetry(() => fetchUserRow(globalUID));
    if (count >= 6) {
      showNotification('コンプリート！', 'スタンプが6個たまりました！<br>特典と交換してください。');
      return;
    }
    const newCount = await fetchWithRetry(() => updateStampCount(globalUID, count + 1));
    updateStampDisplay(newCount);
    updateRewardButtons(newCount);

    if (newCount === 3) showNotification('🎉 特典解除！', 'コーヒー1杯と交換できます！<br>あと3スタンプでカレー1杯無料！');
    else if (newCount === 6) showNotification('🎊 コンプリート！', '全てのスタンプを集めました！<br>カレー1杯と交換できます！');
    else showNotification('スタンプ獲得', `現在 ${newCount} 個（あと${6 - newCount}個でカレー無料）`);
    
    announceToScreenReader(`スタンプを獲得しました。現在${newCount}個です。`);
  } catch (error) {
    console.error('Stamp addition failed:', error);
    showNotification('エラー', 'スタンプの追加に失敗しました。<br>インターネット接続を確認してください。');
  }
}

async function redeemReward(type) {
  if (!globalUID) return;
  if (!navigator.onLine) {
    queueAction({ type: 'REDEEM_REWARD', rewardType: type });
    showToast('オフラインです。オンライン復帰後に特典を交換します。', 'warning');
    return;
  }
  try {
    const count = await fetchWithRetry(() => fetchUserRow(globalUID));
    const required = type === 'coffee' ? 3 : 6;
    const rewardName = type === 'coffee' ? 'コーヒー1杯' : 'カレー1杯';
    if (count < required) return;
    if (!confirm(`${rewardName}と交換しますか？\n（スタンプが${required}個消費されます）`)) return;

    const newCount = await fetchWithRetry(() => updateStampCount(globalUID, count - required));
    await db.from('reward_history').insert({ user_id: globalUID, reward_name: rewardName, points_consumed: required });
    
    updateStampDisplay(newCount);
    updateRewardButtons(newCount);
    displayRewardHistory();
    
    showNotification('交換完了', `${rewardName}と交換しました！<br>店舗でスタッフにお見せください。`);
    showToast('特典を交換しました！', 'success');
    announceToScreenReader(`${rewardName}と交換しました。`);
  } catch (error) {
    showNotification('エラー', '特典の交換に失敗しました。');
  }
}

function initQRScanner() {
  const qrModal = document.getElementById('qr-modal');
  openModal(qrModal, 'scan-qr');
  let isProcessing = false;
  html5QrCode = new Html5Qrcode('qr-reader');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    async (decodedText) => {
      if (isProcessing) return;
      isProcessing = true;
      if (html5QrCode.isScanning) await html5QrCode.stop();
      closeModal(qrModal);
      if (decodedText === appData.qrString) await addStamp();
      else showNotification('無効なQR', 'お店のQRコードではありません。');
    },
    (errorMessage) => {}
  ).catch(() => {
    document.getElementById('qr-reader').innerHTML = '<p style="color: red;">カメラの起動に失敗しました</p>';
    showToast('カメラへのアクセスが拒否されました', 'error');
  });
}

function createArticleCard(cardData) {
  const placeholderUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjI1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkxvYWRpbmcuLi48L3RleHQ+PC9zdmc+';
  const fallbackUrl = 'https://via.placeholder.com/400x250.png?text=Route227';
  const div = document.createElement('div');
  div.className = 'card';
  const imageUrl = cardData.image_url || fallbackUrl;
  div.innerHTML = `
    <div class="article-link" data-article-id="${cardData.id}" role="button" tabindex="0">
      <div class="image-container">
        <img src="${placeholderUrl}" data-src="${escapeHtml(imageUrl)}" alt="${escapeHtml(cardData.title)}のサムネイル" loading="lazy" class="article-image lazy-image" onerror="this.onerror=null;this.src='${fallbackUrl}';">
      </div>
      <div class="card-body">
        <h3 class="article-title">${escapeHtml(cardData.title)}</h3>
        <p class="article-excerpt">${escapeHtml(cardData.summary)}</p>
      </div>
    </div>`;
  const img = div.querySelector('.lazy-image');
  if (imageObserver) imageObserver.observe(img);
  else img.src = img.dataset.src;
  return div;
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
    loadMoreBtn.textContent = '読み込み中…';
    loadMoreBtn.disabled = true;
  }
  (async () => {
    try {
      const from = currentPage * ARTICLES_PER_PAGE;
      const to = from + ARTICLES_PER_PAGE - 1;
      let query = db.from('articles').select('*').order('created_at', { ascending: false }).range(from, to);
      if (category !== 'all') query = query.eq('category', category);
      const { data: newArticles, error } = await query;
      if (error) throw error;
      if (clearContainer) articlesContainer.innerHTML = '';
      articlesCache.push(...newArticles);

      if (articlesCache.length === 0 && clearContainer) {
        articlesContainer.innerHTML = '<p style="text-align: center; padding: 20px;">記事はまだありません。</p>';
      } else {
        const fragment = document.createDocumentFragment();
        newArticles.forEach(cardData => fragment.appendChild(createArticleCard(cardData)));
        articlesContainer.appendChild(fragment);
      }
      loadMoreBtn.classList.toggle('visible', newArticles.length >= ARTICLES_PER_PAGE);

      document.querySelectorAll('.article-link').forEach(link => {
        if (link.dataset.listenerAttached) return;
        link.dataset.listenerAttached = 'true';
        const showModal = () => showSummaryModal(parseInt(link.dataset.articleId, 10));
        link.addEventListener('click', showModal);
        link.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showModal();
          }
        });
      });
    } catch (error) {
      console.error("記事の読み込みエラー:", error);
      if(articlesContainer) articlesContainer.innerHTML = '<p style="text-align: center; color: red;">記事の読み込みに失敗しました。</p>';
      showToast('記事の読み込みに失敗しました', 'error');
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
  
  const fallbackUrl = 'https://via.placeholder.com/400x250.png?text=Route227';
  const imageUrl = article.image_url || fallbackUrl;
  imgEl.style.backgroundImage = `url('${imageUrl}')`;
  titleEl.textContent = article.title;

  if (article.summary_points && Array.isArray(article.summary_points)) {
    bulletsEl.innerHTML = article.summary_points.map(p => `<li>${escapeHtml(p).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('');
  } else {
    bulletsEl.innerHTML = '';
  }
  const articleUrl = article.article_url?.trim();
  if (!articleUrl) {
    readMoreBtn.style.display = 'none';
  } else {
    readMoreBtn.href = articleUrl;
    readMoreBtn.style.display = 'flex';
  }
  openModal(modal, 'articles-container');
}

function handleUrlHash() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#article-')) {
    const articleId = parseInt(hash.substring(9), 10);
    if (isNaN(articleId)) return;
    let attempts = 0;
    const maxAttempts = 20;
    const tryShowModal = () => {
      const article = articlesCache.find(a => a.id === articleId);
      if (article) showSummaryModal(articleId);
      else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(tryShowModal, 500);
      }
    };
    tryShowModal();
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
}

window.addEventListener('pageshow', function (event) {
  if (event.persisted) window.location.reload();
});

async function updateFoodtruckInfo() {
  const infoContainer = document.getElementById('today-info-container');
  const imageContainer = document.getElementById('schedule-image-container');
  if (!infoContainer || !imageContainer) return;

  const scheduleImageUrl = 'https://hccairtzksnnqdujalgv.supabase.co/storage/v1/object/public/schedule-images//schedule.png';
  imageContainer.src = scheduleImageUrl;
  imageContainer.style.display = 'block';
  imageContainer.onerror = () => {
    imageContainer.style.display = 'none';
    showToast('スケジュール画像の読み込みに失敗しました', 'error');
  };
  infoContainer.innerHTML = '<p>情報を読み込んでいます…</p>';

  try {
    const today = new Date();
    today.setHours(today.getHours() + 9);
    const todayString = today.toISOString().split('T')[0];
    const { data, error } = await fetchWithRetry(() => db.from('schedule').select('message').eq('date', todayString).single());
    if (error && error.code !== 'PGRST116') throw error;
    if (data && data.message) infoContainer.innerHTML = `<p>${escapeHtml(data.message).replace(/\n/g, '<br>')}</p>`;
    else infoContainer.innerHTML = '<p>本日の出店はありません。</p>';
  } catch (err) {
    infoContainer.innerHTML = '<p>エラーが発生しました。情報の取得に失敗しました。</p>';
    showToast('出店情報の取得に失敗しました', 'error');
  }
}

function initializeRankPage() {
  console.log('Rank page initialization placeholder');
}

async function displayRewardHistory() {
  if (!globalUID) return;
  const historyList = document.getElementById('history-list');
  const emptyMessage = document.getElementById('history-empty-message');
  if (!historyList || !emptyMessage) return;
  try {
    const { data, error } = await db.from('reward_history').select('*').eq('user_id', globalUID).order('exchanged_at', { ascending: false });
    if (error) throw error;
    if (data.length === 0) {
      emptyMessage.classList.remove('hidden');
      historyList.innerHTML = '';
    } else {
      emptyMessage.classList.add('hidden');
      historyList.innerHTML = data.map(item => {
        const date = new Date(item.exchanged_at);
        const formattedDate = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        return `
          <li class="history-item">
            <div class="history-info">
              <span class="history-reward-name">${escapeHtml(item.reward_name)}</span>
              <span class="history-date">${formattedDate}</span>
            </div>
            <div class="history-points">
              -${item.points_consumed}<span>pt</span>
            </div>
          </li>`;
      }).join('');
    }
  } catch (err) {
    console.error("履歴の取得エラー:", err);
    showToast('交換履歴の取得に失敗しました', 'error');
  }
}

const srOnlyStyle = document.createElement('style');
srOnlyStyle.textContent = `.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }`;
document.head.appendChild(srOnlyStyle);
