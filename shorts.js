// 1. Supabase クライアントの初期化 (変更なし)
const { createClient } = window.supabase;
const supabase = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

// 2. 必要なHTML要素を取得 (変更なし)
const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");
const toast = document.getElementById("toast-notification"); // ★追加：トースト要素を取得

// セッションで共有する変数を定義 (変更なし)
let sessionSeed = Math.random() * 2 - 1;
let articleOffset = 0;
let isLoading = false;

// ★★★ ここからが修正箇所 ★★★

// 3. トースト通知を表示する関数を追加
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show"); // 表示クラスを追加

  // 3秒後に非表示クラスに戻す
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}


// 4. 記事を1件読み込んで画面に表示する関数
async function loadCard() {
  if (isLoading) return;
  isLoading = true;

  const { data: articles, error } = await supabase
    .rpc('get_seeded_shorts_articles', {
        p_seed: sessionSeed,
        p_offset: articleOffset
    });

  // 「リストの終端に達した」エラーをチェック
  if (error && error.code === 'PGRST116') {
    // console.log の代わりに showToast を呼び出す
    showToast("全記事を一周しました。もう一度、先頭から表示します。");
    
    articleOffset = 0; 
    isLoading = false; 
    await loadCard();  
    return;
  }

  // その他の予期せぬエラー
  if (error) {
    console.error("Supabase RPCの呼び出し中に予期せぬエラーが発生しました:", error.message);
    isLoading = false; 
    return;
  }
  
  // データが空の配列だった場合
  if (!articles || articles.length === 0) {
    // こちらでも同様にトーストを表示しても良い
    showToast("リストの先頭に戻ります。");
    articleOffset = 0;
    isLoading = false;
    await loadCard();
    return;
  }
  
  const art = articles[0];
  articleOffset++;

  const node = tpl.content.cloneNode(true);
  node.querySelector("img").src      = art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href       = art.article_url;
  feed.append(node);

  isLoading = false;
}

// 5. 初期表示と無限スクロールのロジック (変更なし)
async function initializeFeed() {
    for (let i = 0; i < 3; i++) {
        await loadCard();
    }
    setupIntersectionObserver();
}

function setupIntersectionObserver() {
    if (!feed.lastElementChild) {
        return; 
    }
    const io = new IntersectionObserver(async (entries, observer) => {
        if (entries[0].isIntersecting && !isLoading) {
            observer.unobserve(entries[0].target);
            await loadCard();
            if (feed.lastElementChild) {
                observer.observe(feed.lastElementChild);
            }
        }
    }, { threshold: 0.6 });
    io.observe(feed.lastElementChild);
}

// スクロールをピタッと止めるためのロジック (変更なし)
const scrollContainer = document.getElementById('feed');
let scrollTimer = null;
scrollContainer.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const containerHeight = scrollContainer.offsetHeight;
    const targetIndex = Math.round(scrollContainer.scrollTop / containerHeight);
    const targetScrollTop = targetIndex * containerHeight;
    scrollContainer.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  }, 100);
});

// 最初にフィードを初期化
initializeFeed();
