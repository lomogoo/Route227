// app.js（修正版・差し替え用）
// 現状デザインの趣意をキープしつつ、体感・安定性を上げる“非破壊”アップデート。
// - 既存の Supabase 設定・機能ロジックを壊さない（上書きしない）
// - フェイルセーフでローダー解除 / ヘッダー影 / 画像の遅延読み込み / スケルトン補助
// - クリック伝播の誤爆抑止（モーダル・ナビ）
// - ログインボタンが無反応だった件をガード（存在する場合のみ結線）

(function main(){
  document.addEventListener('DOMContentLoaded', () => {
    safeInit();
    headerElevateOnScroll();
    loaderFailSafe();
    setupImageLazyLoading();
    setupOfflineDetection();
    setupStaticEventListeners();
    handleUrlHash();
    tryInitialRender();
  });
})();

// ========================
//  Supabase: 既存優先で取得
// ========================
function getSupabaseClientSafely(){
  // 既にどこかで初期化済みならそれを使う
  if (window.db) return window.db;
  if (window.supabaseClient) return (window.db = window.supabaseClient);
  if (window.supabase && typeof window.supabase.createClient === 'function'){
    // 既存のグローバル定数がある想定（index.html 等）
    const url = window.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : undefined);
    const key = window.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : undefined);
    if (url && key){
      try {
        const client = window.supabase.createClient(url, key);
        return (window.db = client);
      } catch(e){ console.error('[Supabase] createClient 失敗', e); }
    }
  }
  console.warn('[Supabase] クライアントが見つかりません（既存初期化を保持してください）');
  return null;
}

function safeInit(){
  const db = getSupabaseClientSafely();
  if (!db) return;

  // 重複購読を避けるため、一度だけ購読
  if (!window.__authSubscribed){
    window.__authSubscribed = true;
    let initialHandled = false;
    db.auth.onAuthStateChange(async (_event, session) => {
      // 1) 初回でローダーを確実に外す
      removeAppLoader();
      // 2) ユーザーステータスの更新（存在すれば）
      try { if (typeof updateUserStatus === 'function') updateUserStatus(session); } catch{}
      // 3) 初回はセクション描画（エラー時は feed）
      if (!initialHandled){
        initialHandled = true;
        try { await showSection(getInitialSectionId(), true); }
        catch { await showSection('feed-section', true); }
      }
    });
  }

  // ログインボタン（存在する場合のみ結線）
  const loginBtn = document.getElementById('login-submit');
  if (loginBtn && !loginBtn.dataset.bound){
    loginBtn.dataset.bound = '1';
    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const email = document.getElementById('login-email')?.value?.trim();
      const pass  = document.getElementById('login-password')?.value ?? '';
      if (!email || !pass){
        showToast('メールとパスワードを入力してください', 'error');
        return;
      }
      try{
        const { error } = await db.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        showToast('ログインしました', 'success');
        closeModal(document.getElementById('login-modal'));
        await showSection(getActiveSectionId() || 'feed-section', false);
      }catch(err){
        console.error('[Login] 失敗', err);
        showToast('ログインに失敗しました', 'error');
      }
    });
  }
}

// ========================
//  ローダー / ヘッダー影
// ========================
function loaderFailSafe(){
  const loader = document.getElementById('app-loader');
  if (!loader) return;
  setTimeout(() => loader.classList.remove('active'), 3500);
}
function removeAppLoader(){
  const loader = document.getElementById('app-loader');
  if (loader && loader.classList.contains('active')) loader.classList.remove('active');
}
function headerElevateOnScroll(){
  const header = document.querySelector('.app-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('elevated', window.scrollY > 4);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

// ========================
//  画像遅延読み込み
// ========================
let imageObserver = null;
function setupImageLazyLoading(){
  const fallback = 'https://via.placeholder.com/400x250.png?text=Route227';
  if ('IntersectionObserver' in window) {
    imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting){
          const img = entry.target;
          const src = img.dataset.src;
          if (src){ img.src = src; img.removeAttribute('data-src'); }
          imageObserver.unobserve(img);
        }
      });
    }, { rootMargin: '200px 0px' });

    document.querySelectorAll('img.lazy-image').forEach(img => imageObserver.observe(img));
  } else {
    document.querySelectorAll('img.lazy-image').forEach(img => { img.src = img.dataset.src || fallback; });
  }
}

// ========================
//  オフライン検出
// ========================
function setupOfflineDetection(){
  const handler = () => {
    const online = navigator.onLine;
    showToast(online ? 'オンラインになりました' : 'オフラインです', online ? 'info' : 'error');
  };
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
}

// ========================
//  セクション切替（既存関数があればそれを使う）
// ========================
async function showSection(sectionId, isInitialLoad){
  // 既存の showSection があればそちらを使用
  if (window.__original_showSection && window.__original_showSection !== showSection){
    return window.__original_showSection(sectionId, isInitialLoad);
  }

  // 初回呼び出しで既存を保存
  if (!window.__original_showSection && typeof window.showSection === 'function' && window.showSection !== showSection){
    window.__original_showSection = window.showSection;
    return window.__original_showSection(sectionId, isInitialLoad);
  }

  // ここからは“最小限の自前実装”（既存が無い場合のフォールバック）
  const appLoader = document.getElementById('app-loader');
  if (!isInitialLoad && appLoader) appLoader.classList.add('active');

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.section === sectionId));

  const el = document.getElementById(sectionId);
  if (el){
    el.classList.add('active');
    // 既存の各ページ初期化関数があれば呼ぶ
    try { if (sectionId === 'feed-section' && typeof initializeFeedPage === 'function') await initializeFeedPage(); } catch{}
    try { if (sectionId === 'foodtruck-section' && typeof initializeFoodtruckPage === 'function') initializeFoodtruckPage(); } catch{}
    try { if (sectionId === 'rank-section' && typeof initializeRankPage === 'function') initializeRankPage(); } catch{}
    sessionStorage.setItem('activeSection', sectionId);
    if (history?.replaceState) history.replaceState(null, '', `#${sectionId}`);
  }

  if (!isInitialLoad && appLoader) setTimeout(() => appLoader.classList.remove('active'), 120);
}

function getInitialSectionId(){
  const valid = ['feed-section', 'rank-section', 'foodtruck-section'];
  const hash = (location.hash || '').replace('#','');
  if (valid.includes(hash)) return hash;
  const saved = sessionStorage.getItem('activeSection');
  if (valid.includes(saved)) return saved;
  return 'feed-section';
}
function getActiveSectionId(){ return document.querySelector('.nav-link.active')?.dataset.section; }

// ========================
//  スケルトン補助（既存 renderArticles の改善用）
// ========================
function showArticleSkeletons(container, count = 4){
  if (!container) return;
  const frag = document.createDocumentFragment();
  for (let i=0; i<count; i++){
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="image-container skeleton"></div>
      <div class="card-body">
        <div class="skeleton" style="height:18px;width:70%;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:14px;width:90%;"></div>
      </div>`;
    frag.appendChild(card);
  }
  container.innerHTML = '';
  container.appendChild(frag);
}

// ========================
//  モーダル / ナビのイベント安全化
// ========================
function setupStaticEventListeners(){
  // フッターナビ（誤爆防止）
  document.querySelectorAll('.nav-link').forEach(btn => {
    if (btn.dataset.bound) return; btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const section = e.currentTarget.dataset.section;
      if (section) await showSection(section, false);
    }, { passive: false });
  });

  // モーダル閉じる（外側クリック or 指定の閉じるボタン）
  document.body.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    const clickOutsideModal = modal && e.target === modal;
    const isCloseButton = e.target.matches('.close-modal, .modal-ok-btn');
    if (clickOutsideModal || isCloseButton) closeModal(modal);
  });

  // Escape でモーダルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){
      const activeModal = document.querySelector('.modal.active');
      if (activeModal) closeModal(activeModal);
    }
  });
}

// 既存の openModal / closeModal があればそれを使い、無ければフォールバック
function openModal(modalElement){
  if (typeof window.openModal === 'function' && window.openModal !== openModal) return window.openModal(modalElement);
  if (!modalElement) return; modalElement.classList.add('active');
}
function closeModal(modalElement){
  if (typeof window.closeModal === 'function' && window.closeModal !== closeModal) return window.closeModal(modalElement);
  if (!modalElement) return; modalElement.classList.remove('active');
}

// ========================
//  URLハッシュ
// ========================
function handleUrlHash(){
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace('#','');
    if (id) showSection(id, false);
  });
}

// ========================
//  トースト（存在しなければ簡易表示）
// ========================
function showToast(message, type = 'info'){
  const toast = document.getElementById('toast-notification');
  if (toast){
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2200);
  } else {
    // 代替（開発用）
    console.log(`[${type}]`, message);
  }
}

// ========================
//  初回描画（安全な順序）
// ========================
async function tryInitialRender(){
  // 既に別の初期化が動いている場合もあるので最小限
  const current = getActiveSectionId();
  await showSection(current || getInitialSectionId(), true);
}
