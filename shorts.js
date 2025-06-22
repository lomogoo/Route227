// 1. Supabase クライアントの初期化 (変更なし)
const { createClient } = window.supabase;
const supabase = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

// 2. 必要なHTML要素を取得 (変更なし)
const feed = document.getElementById("feed");
const tpl  = document.getElementById("tpl");

// ★★★ 変更点 1: セッションで共有する変数を定義 ★★★
// ページ読み込み時に、-1から1の間のランダムなシード値を1つ生成
let sessionSeed = Math.random() * 2 - 1;
// 現在の再生リストの位置（オフセット）を記録
let articleOffset = 0;


// 3. 記事を1件読み込んで画面に表示する関数
async function loadCard() {
  // ★★★ 変更点 2: VIEWではなく、作成したRPC関数を呼び出す ★★★
  const { data: art, error } = await supabase
    .rpc('get_seeded_shorts_articles', {
        p_seed: sessionSeed,     // ページ読み込み時に決めたシード値を渡す
        p_offset: articleOffset  // 次に取得したい記事の位置を渡す
    });

  if (error) {
    console.error("Supabase RPCの呼び出し中にエラーが発生しました:", error.message);
    return;
  }
  
  // ★★★ 変更点 3: ループ処理（最後までいったら最初に戻る） ★★★
  // もしartがnullなら、全記事を読み終わったということ
  if (!art) {
    console.log("全記事を一周しました。最初からリスタートします。");
    articleOffset = 0; // オフセットをリセット
    // もう一度loadCardを呼び出して、リストの最初の記事を取得
    // この再帰呼び出しにより、ユーザーは途切れることなくコンテンツを見続けられる
    await loadCard(); 
    return; // この後の処理は新しいloadCardに任せる
  }
  
  // 取得できたら、次のためにオフセットを1増やす
  articleOffset++;

  // <template> タグからカードのHTML構造をコピーしてデータを埋め込む (変更なし)
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
