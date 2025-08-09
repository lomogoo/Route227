// app.js（統合版・全文）
// 現行デザインを崩さず、体感速度＆安定性を上げる“非破壊アップデート”。
// - 既存のロジックがあれば優先して使う（上書きしない）
// - Supabase 初期化は index.html の window.SUPABASE_URL / ANON_KEY を使用
// - フェイルセーフローダー / ヘッダー影 / 画像遅延読込 / スケルトン補助 / クリック誤爆防止
// - 足りない最低限の実装（ログインUI、フィード描画）をフォールバックとして同梱

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
  // 既存の共有インスタンスがあればそれを使う
  if (window.db) return window.db;
  if (window.supabaseClient) return (window.db = window.supabaseClient);
  // CDN で supabase-js v2 が読み込まれている想定
  if (window.supabase && typeof window.supabase.createClient === 'function'){
    const url = window.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : undefined);
    const key = window.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : undefined);
    if (url && key){
      try { const client = window.supabase.createClient(url, key); return (window.db = client); }
      catch(e){ console.error('[Supabase] createClient 失敗', e); }
    } else {
      console.warn('[Supabase] URL / ANON KEY が設定されていません（index.html に設定してください）');
    }
  } else {
    console.warn('[Supabase] supabase-js が読み込まれていません（index.html でCDNを読んでください）');
  }
  return null;
}

function safeInit(){
  const db = getSupabaseClientSafely();
  if (!db) return;

  if (!window.__authSubscribed){
    window.__authSubscribed = true;
    let initialHandled = false;
    db.auth.onAuthStateChange(async (_event, session) => {
      // 初回でローダーを確実に外す
      removeAppLoader();
      // ログインUIの更新（フォールバックが用意されている）
      try { updateUserStatus(session); } catch(e){ console.warn('updateUserStatus failed', e); }
      // 初回レンダリング
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
      if (!email || !pass){ showToast('メールとパスワードを入力してください', 'error'); return; }
      try{
        const { error } = await db.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        showToast('ログインしました', 'success');
        closeModal(document.getElementById('login-modal'));
        await showSection(getActiveSectionId() || 'feed-section', false);
      }catch(err){ console.error('[Login] 失敗', err); showToast('ログインに失敗しました', 'error'); }
    });
  }
}

// ========================
//  ローダー / ヘッダー影
// ========================
function loaderFailSafe(){ const l = document.getElementById('app-loader'); if (!l) return; setTimeout(() => l.classList.remove('active'), 3500); }
function removeAppLoader(){ const l = document.getElementById('app-loader'); if (l && l.classList.contains('active')) l.classList.remove('active'); }
function headerElevateOnScroll(){ const h = document.querySelector('.app-header'); if (!h) return; const onS=()=>h.classList.toggle('elevated', window.scrollY>4); onS(); window.addEventListener('scroll', onS, {passive:true}); }

// ========================
//  画像遅延読み込み
// ========================
let imageObserver = null;
function setupImageLazyLoading(){
  const fallback = 'https://via.placeholder.com/400x250.png?text=Route227';
  if ('IntersectionObserver' in window) {
    imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting){ const img = entry.target; const src = img.dataset.src; if (src){ img.src = src; img.removeAttribute('data-src'); } imageObserver.unobserve(img); }
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
  const handler = () => { const online = navigator.onLine; showToast(online ? 'オンラインになりました' : 'オフラインです', online ? 'info' : 'error'); };
  window.addEventListener('online', handler); window.addEventListener('offline', handler);
}

// ========================
//  セクション切替（既存関数があればそれを使う）
// ========================
async function showSection(sectionId, isInitialLoad){
  // 既存があればそれを優先
  if (window.__original_showSection && window.__original_showSection !== showSection){ return window.__original_showSection(sectionId, isInitialLoad); }
  if (!window.__original_showSection && typeof window.showSection === 'function' && window.showSection !== showSection){ window.__original_showSection = window.showSection; return window.__original_showSection(sectionId, isInitialLoad); }

  // フォールバック実装
  const appLoader = document.getElementById('app-loader');
  if (!isInitialLoad && appLoader) appLoader.classList.add('active');
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.section === sectionId));
  const el = document.getElementById(sectionId);
  if (el){
    el.classList.add('active');
    try { if (sectionId === 'feed-section' && typeof initializeFeedPage === 'function') await initializeFeedPage(); } catch{}
    try { if (sectionId === 'foodtruck-section' && typeof initializeFoodtruckPage === 'function') initializeFoodtruckPage(); } catch{}
    try { if (sectionId === 'rank-section' && typeof initializeRankPage === 'function') initializeRankPage(); } catch{}
    sessionStorage.setItem('activeSection', sectionId);
    if (history?.replaceState) history.replaceState(null, '', `#${sectionId}`);
  }
  if (!isInitialLoad && appLoader) setTimeout(() => appLoader.classList.remove('active'), 120);
}
function getInitialSectionId(){ const v=['feed-section','rank-section','foodtruck-section']; const h=(location.hash||'').replace('#',''); if(v.includes(h))return h; const s=sessionStorage.getItem('activeSection'); if(v.includes(s))return s; return 'feed-section'; }
function getActiveSectionId(){ return document.querySelector('.nav-link.active')?.dataset.section; }

// ========================
//  スケルトン補助（既存 renderArticles の改善用）
// ========================
function showArticleSkeletons(container, count = 4){ if (!container) return; const f=document.createDocumentFragment(); for (let i=0;i<count;i++){ const c=document.createElement('div'); c.className='card'; c.innerHTML=`<div class="image-container skeleton"></div><div class="card-body"><div class="skeleton" style="height:18px;width:70%;margin-bottom:10px;"></div><div class="skeleton" style="height:14px;width:90%;"></div></div>`; f.appendChild(c);} container.innerHTML=''; container.appendChild(f); }

// ========================
//  モーダル / ナビのイベント安全化
// ========================
function setupStaticEventListeners(){
  // フッターナビ（誤爆防止）
  document.querySelectorAll('.nav-link').forEach(btn => { if (btn.dataset.bound) return; btn.dataset.bound='1'; btn.addEventListener('click', async (e)=>{ e.preventDefault(); e.stopPropagation(); const section=e.currentTarget.dataset.section; if (section) await showSection(section, false); }, { passive:false }); });
  // モーダル閉じる（外側クリック or 指定の閉じるボタン）
  document.body.addEventListener('click', (e) => { const modal = e.target.closest('.modal'); const clickOutside = modal && e.target === modal; const isClose = e.target.matches('.close-modal, .modal-ok-btn'); if (clickOutside || isClose) closeModal(modal); });
  // Escape でモーダル閉じ
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ const m=document.querySelector('.modal.active'); if (m) closeModal(m); } });
}

// 既存があれば優先、無ければフォールバック
function openModal(modalElement){ if (typeof window.openModal === 'function' && window.openModal !== openModal) return window.openModal(modalElement); if (!modalElement) return; modalElement.classList.add('active'); }
function closeModal(modalElement){ if (typeof window.closeModal === 'function' && window.closeModal !== closeModal) return window.closeModal(modalElement); if (!modalElement) return; modalElement.classList.remove('active'); }

// ========================
//  URLハッシュ
// ========================
function handleUrlHash(){ window.addEventListener('hashchange', () => { const id=(location.hash||'').replace('#',''); if (id) showSection(id, false); }); }

// ========================
//  トースト（存在しなければ簡易表示）
// ========================
function showToast(message, type = 'info'){ const t=document.getElementById('toast-notification'); if (t){ t.className=`toast ${type}`; t.textContent=message; t.style.display='block'; setTimeout(()=>{t.style.display='none';},2200);} else { console.log(`[${type}]`, message); } }

// ========================
//  初回描画（安全な順序）
// ========================
async function tryInitialRender(){ const current=getActiveSectionId(); await showSection(current || getInitialSectionId(), true); }

// ========================
//  フォールバック: ログイン/ログアウト UI
// ========================
if (typeof updateUserStatus !== 'function'){
  function updateUserStatus(session){
    const el = document.getElementById('user-status'); if (!el) return;
    if (session){
      el.innerHTML = '<button id="logout-button" class="btn">ログアウト</button>';
      document.getElementById('logout-button')?.addEventListener('click', async ()=>{ const db=getSupabaseClientSafely(); if(!db) return; await db.auth.signOut(); showToast('ログアウトしました', 'info'); });
    } else {
      el.innerHTML = '<button id="open-login-modal-btn" class="btn primary">ログイン</button>';
      document.getElementById('open-login-modal-btn')?.addEventListener('click', ()=> openModal(document.getElementById('login-modal')));
    }
  }
}

// ========================
//  フォールバック: フィード描画（articles テーブル想定）
// ========================
if (typeof initializeFeedPage !== 'function'){
  let __page = 0, __cat = 'all', __loading = false; const PAGE_SIZE = 10;
  async function initializeFeedPage(){
    const tabs=document.getElementById('category-tabs');
    if (tabs && !tabs.dataset.bound){ tabs.dataset.bound='1'; tabs.addEventListener('click', (e)=>{ if (e.target.classList.contains('category-tab')){ __page=0; __cat=e.target.dataset.category||'all'; document.querySelectorAll('.category-tab').forEach(t=>t.classList.remove('active')); e.target.classList.add('active'); renderArticles(__cat, true); } }); }
    __page=0; __cat='all';
    document.querySelectorAll('.category-tab').forEach(t=> t.classList.toggle('active', t.dataset.category==='all'));
    renderArticles(__cat, true);
    document.getElementById('load-more-btn')?.addEventListener('click', ()=> !__loading && renderArticles(__cat, false));
  }
  async function renderArticles(category, clearContainer){
    const db=getSupabaseClientSafely(); const box=document.getElementById('articles-container'); const more=document.getElementById('load-more-btn');
    if (!db || !box || !more) return; if (__loading) return; __loading=true;
    if (clearContainer){ showArticleSkeletons(box,4); __page=0; } else { more.classList.add('is-loading'); }
    try{
      const from=__page*PAGE_SIZE, to=from+PAGE_SIZE-1;
      let q=db.from('articles').select('*').order('created_at', { ascending:false }).range(from, to);
      if (category && category!=='all') q=q.eq('category', category);
      const { data, error } = await q; if (error) throw error;
      if (clearContainer) box.innerHTML='';
      if (!data || data.length===0){ if (clearContainer) box.innerHTML='<p class="center text-muted">記事はまだありません。</p>'; more.classList.remove('visible'); return; }
      const frag=document.createDocumentFragment();
      data.forEach(a=>{ const el=document.createElement('div'); el.className='card'; const img=a.image_url||'https://via.placeholder.com/400x250.png?text=Route227'; el.innerHTML=`<div class="image-container"><img class="article-image lazy-image" data-src="${img}" alt="${(a.title||'記事')}" loading="lazy"/></div><div class="card-body"><h3 class="article-title">${(a.title||'（無題）')}</h3><p class="article-excerpt">${(a.summary||'')}</p></div>`; frag.appendChild(el); });
      box.appendChild(frag);
      document.querySelectorAll('img.lazy-image[data-src]').forEach(i=> imageObserver ? imageObserver.observe(i) : (i.src=i.dataset.src));
      __page++; more.classList.toggle('visible', data.length>=PAGE_SIZE);
    } catch(e){ console.error('[articles] load failed', e); box.innerHTML = `<p class="center" style="color:#c00">読み込みに失敗しました：${e.message||e}</p>`; }
    finally { __loading=false; more.classList.remove('is-loading'); more.textContent='もっと見る'; }
  }
}

// ========================
//  スタンプ／ランクなどの既存関数は、存在すればそのまま使います（ここでは定義しない）
// ========================
