// 1. Supabase クライアントの初期化 (変更なし)
const { createClient } = window.supabase;
const supabase = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

// 2. 必要なHTML要素を取得 (変更なし)
const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");

// セッションで共有する変数を定義 (変更なし)
let sessionSeed = Math.random() * 2 - 1;
let articleOffset = 0;


// 3. 記事を1件読み込んで画面に表示する関数
async function loadCard() {
  // ★★★ ここからが修正箇所です ★★★

  // 1. RPC関数を呼び出す (変数名を`articles`に変更)
  const { data: articles, error } = await supabase
    .rpc('get_seeded_shorts_articles', {
        p_seed: sessionSeed,
        p_offset: articleOffset
    });

  if (error) {
    console.error("Supabase RPCの呼び出し中にエラーが発生しました:", error.message);
    return;
  }
  
  // 2. 結果が空の配列か、そもそもデータがないかチェック
  if (!articles || articles.length === 0) {
    console.log("全記事を一周しました。最初からリスタートします。");
    articleOffset = 0; 
    await loadCard(); 
    return;
  }
  
  // 3. 配列から最初の1件を取り出す
  const art = articles[0];

  // 取得できたら、次のためにオフセットを1増やす
  articleOffset++;

  // ★★★ 修正箇所はここまで ★★★


  // <template> タグからカードのHTML構造をコピーしてデータを埋め込む (この部分は変更なし)
  const node = tpl.content.cloneNode(true);
  node.querySelector("img").src      = art.image_url || "https://placehold.co/720x1280?text=No+Image";
  node.querySelector("h2").textContent = art.title;
  node.querySelector("p").textContent  = art.summary;
  node.querySelector("a").href       = art.article_url;
  feed.append(node);
}

// 4. 初期表示として、まず3枚のカードを読み込む (変更なし)
async function initializeFeed() {
    for (let i = 0; i < 3; i++) {
        await loadCard();
    }
    setupIntersectionObserver();
}

// 5. 無限スクロールの仕組み (変更なし)
function setupIntersectionObserver() {
    if (!feed.lastElementChild) {
        return; 
    }
    const io = new IntersectionObserver(async (entries, observer) => {
        if (entries[0].isIntersecting) {
            observer.unobserve(entries[0].target);
            await loadCard();
            if (feed.lastElementChild) {
                observer.observe(feed.lastElementChild);
            }
        }
    }, { threshold: 0.6 });

    io.observe(feed.lastElementChild);
}


// --- スクロールをピタッと止めるためのロジック (変更なし) ---
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

// 最初にフィードを初期化 (変更なし)
initializeFeed();
